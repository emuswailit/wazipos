// components/onboarding/ApprovalsDesk.tsx — WaziPOS admins: watch sign-ups and approve new businesses.
//
// Approvals: each self-opened business with its owner's checklist (email, phone, ID +
// photo, location, payout account, stock). Approve = one click: the business goes
// live, its payout account is confirmed and the free month starts. Send back needs
// a reason (the owner is emailed and texted).
// Sign-ups: every new account of the last 7 / 14 / 30 days and how far each got.

import onboardingApi, { type ApprovalRow, type ApprovalStatus, type SignupRow } from '@/api/onboardingApi';
import { AdminSheet } from '@/components/common/listScreen';
import { useAlert } from '@/components/common/AlertProvider';
import { toast } from '@/components/common/Toast';
import { InlineNotice, PosCard, PosHeader, PrimaryCTA, Segmented, SoftButton, StatusPill } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isPlatformAdmin } from '@/utils/platformAdmin';
import { isServerOk } from '@/utils/serverResponse';
import { useLocalSearchParams } from 'expo-router';
import { Check, FileImage, MapPin, Search, UserPlus, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

type Tab = 'approvals' | 'signups';
const typeLabel = (t: string) => (t || '').replace(/([A-Z])/g, ' $1').trim();
const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function ApprovalsDesk() {
    const { theme, user } = useAuth() as any;
    const params = useLocalSearchParams<{ tab?: string }>();
    const [tab, setTab] = useState<Tab>(params.tab === 'signups' ? 'signups' : 'approvals');

    if (!isPlatformAdmin(user)) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.background }}>
                <InlineNotice tone="warning" message="Only WaziPOS admins review sign-ups." />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={{ padding: 16, paddingBottom: 0, maxWidth: 1100, width: '100%', alignSelf: 'center', gap: 12 }}>
                <PosHeader icon={UserPlus} title="Sign-ups & approvals" subtitle="New accounts and the businesses waiting for your approval" />
                <Segmented options={[['approvals', 'Approvals'], ['signups', 'Sign-ups']]} value={tab} onChange={setTab} />
            </View>
            {tab === 'approvals' ? <Approvals /> : <Signups />}
        </View>
    );
}

/* ------------------------------------------------------------ approvals */

function Approvals() {
    const { theme } = useAuth();
    const alert = useAlert();
    const [status, setStatus] = useState<ApprovalStatus | 'ALL'>('PENDING');
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<ApprovalRow[] | null>(null);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [rejecting, setRejecting] = useState<ApprovalRow | null>(null);

    const load = useCallback(async () => {
        const res: any = await onboardingApi.adminApprovals({ status, q: q.trim() || undefined }).catch(() => null);
        if (isServerOk(res)) {
            setRows(res.data.approvals.results);
            setCounts(res.data.approvals.counts ?? {});
            setError(null);
        } else setError(describeResponse(res, 'Approvals could not be loaded.').message);
    }, [status, q]);

    useEffect(() => {
        const t = setTimeout(() => void load(), 250);
        return () => clearTimeout(t);
    }, [load]);

    const approve = (r: ApprovalRow) => {
        const missing = r.steps.filter((s) => s.required && !s.done).map((s) => s.label);
        alert(
            `Approve ${r.entity.title}?`,
            missing.length
                ? `Not done yet: ${missing.join(', ')}. Approve anyway? The free month starts now.`
                : 'It goes live, its payout account is confirmed and the free month starts now.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Approve',
                    onPress: async () => {
                        setBusy(r.entity.id);
                        const res: any = await onboardingApi.approve(r.entity.id).catch(() => null);
                        setBusy(null);
                        if (isServerOk(res)) {
                            toast.success('Approved', `${r.entity.title} is live. The owner has been told.`);
                            void load();
                        } else toast.fromResponse(res, 'Could not approve.');
                    },
                },
            ],
        );
    };

    const filters: [ApprovalStatus | 'ALL', string][] = [
        ['PENDING', `Waiting${counts.PENDING ? ` · ${counts.PENDING}` : ''}`],
        ['SETUP', `Setting up${counts.SETUP ? ` · ${counts.SETUP}` : ''}`],
        ['REJECTED', 'Sent back'],
        ['APPROVED', 'Approved'],
    ];

    return (
        <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 48, maxWidth: 1100, width: '100%', alignSelf: 'center', gap: 12 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.primary} />}
        >
            <Segmented options={filters} value={status} onChange={setStatus} />
            <SearchBox value={q} onChange={setQ} placeholder="Search business, owner email or phone" />
            {error ? <InlineNotice message={error} /> : null}
            {rows === null && !error ? <ActivityIndicator color={theme.primary} /> : null}
            {rows?.length === 0 ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, textAlign: 'center', paddingVertical: 30 }}>Nothing here right now.</Text> : null}
            {rows?.map((r) => (
                <PosCard key={r.entity.id} style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{r.entity.title}</Text>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                {typeLabel(r.entity.entity_type)} · {[r.entity.building, r.entity.road, r.entity.town].filter(Boolean).join(', ') || 'No address'}
                            </Text>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                                {r.approval.status === 'PENDING' ? `Submitted ${date(r.approval.submitted_at)}` : `Created ${date(r.created)}`}
                                {r.approval.submissions > 1 ? ` · submission ${r.approval.submissions}` : ''}
                                {r.decided_by ? ` · decided by ${r.decided_by}` : ''}
                            </Text>
                        </View>
                        <StatusPill
                            tone={r.approval.status === 'APPROVED' ? 'success' : r.approval.status === 'REJECTED' ? 'danger' : r.approval.status === 'PENDING' ? 'info' : 'warning'}
                            label={r.approval.status === 'PENDING' ? 'Waiting' : r.approval.status === 'SETUP' ? 'Setting up' : r.approval.status === 'REJECTED' ? 'Sent back' : 'Approved'}
                        />
                    </View>

                    {r.owner ? (
                        <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: 14, padding: 10, gap: 3 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{r.owner.name || 'Owner'}</Text>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>
                                {r.owner.email || 'no email'} {r.owner.email_verified ? '✓' : '✗'} · {r.owner.phone || 'no phone'} {r.owner.phone_verified ? '✓' : '✗'}
                            </Text>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>
                                {r.owner.identifier_type === 'Passport' ? 'Passport' : 'ID'} {r.owner.identifier_number || '—'}
                            </Text>
                        </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {r.steps.map((s) => (
                            <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: s.done ? theme.successSoft : s.required ? theme.dangerSoft : theme.surfaceAlt }}>
                                {s.done ? <Check size={12} color={theme.success} /> : <X size={12} color={s.required ? theme.danger : theme.textMuted} />}
                                <Text style={{ color: s.done ? theme.success : s.required ? theme.danger : theme.textMuted, fontFamily: theme.font.bold, fontSize: 11 }}>
                                    {s.label}{s.key === 'stock' && s.count != null ? ` (${s.count})` : ''}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {r.payout ? (
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>
                            Paid to: {r.payout.account_type} {r.payout.account_number} · {r.payout.account_name} {r.payout.is_verified ? '(verified)' : '(confirmed on approval)'}
                        </Text>
                    ) : null}
                    {r.approval.reason ? <InlineNotice tone="warning" message={`Sent back: ${r.approval.reason}`} /> : null}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {r.owner?.document_url ? <SoftButton label="ID photo" icon={FileImage} tone="neutral" onPress={() => void Linking.openURL(r.owner!.document_url!)} /> : null}
                        {r.location ? (
                            <SoftButton label="Location" icon={MapPin} tone="neutral" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${r.location!.latitude},${r.location!.longitude}`)} />
                        ) : null}
                        <View style={{ flex: 1 }} />
                        {r.approval.status !== 'APPROVED' ? (
                            <>
                                <SoftButton label="Send back" tone="danger" onPress={() => setRejecting(r)} disabled={busy === r.entity.id} />
                                <SoftButton label={busy === r.entity.id ? 'Approving…' : 'Approve'} icon={Check} tone="navy" onPress={() => approve(r)} disabled={busy === r.entity.id} />
                            </>
                        ) : null}
                    </View>
                </PosCard>
            ))}
            <RejectSheet row={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); void load(); }} />
        </ScrollView>
    );
}

function RejectSheet({ row, onClose, onDone }: { row: ApprovalRow | null; onClose: () => void; onDone: () => void }) {
    const { theme } = useAuth();
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    useEffect(() => {
        setReason('');
        setErr(null);
    }, [row]);
    const QUICK = ['The ID photo is unclear — please upload a clearer one', 'The location pin is not at the business premises', 'Add at least a few products to your stock', 'The payout account name does not match the owner or business'];
    const send = async () => {
        if (!row) return;
        setBusy(true);
        const res: any = await onboardingApi.reject(row.entity.id, reason.trim()).catch(() => null);
        setBusy(false);
        if (isServerOk(res)) {
            toast.info('Sent back', 'The owner was emailed and texted what to fix.');
            onDone();
        } else setErr(describeResponse(res, 'Could not send it back.').message);
    };
    return (
        <AdminSheet visible={!!row} onClose={onClose} title="Send back for changes" subtitle={row?.entity.title} icon="return-up-back-outline" dismissible={!busy} width={520}>
            <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {QUICK.map((t) => (
                        <Pressable key={t} onPress={() => setReason(t)} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.surfaceAlt }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 11.5 }}>{t}</Text>
                        </Pressable>
                    ))}
                </View>
                <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="What must the owner fix?"
                    placeholderTextColor={theme.textMuted}
                    multiline
                    style={{ minHeight: 90, borderRadius: 12, padding: 12, backgroundColor: theme.surfaceAlt, color: theme.text, fontFamily: theme.font.medium, fontSize: 15, textAlignVertical: 'top' }}
                />
                {err ? <InlineNotice message={err} /> : null}
                <PrimaryCTA label="Send back to the owner" loading={busy} disabled={reason.trim().length < 5} onPress={() => void send()} />
            </View>
        </AdminSheet>
    );
}

/* ------------------------------------------------------------ sign-ups */

function Signups() {
    const { theme } = useAuth();
    const [days, setDays] = useState<'7' | '14' | '30'>('14');
    const [q, setQ] = useState('');
    const [data, setData] = useState<{ results: SignupRow[]; totals: Record<string, number> } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res: any = await onboardingApi.adminSignups({ days: Number(days), q: q.trim() || undefined }).catch(() => null);
        if (isServerOk(res)) {
            setData(res.data.signups);
            setError(null);
        } else setError(describeResponse(res, 'Sign-ups could not be loaded.').message);
    }, [days, q]);

    useEffect(() => {
        const t = setTimeout(() => void load(), 250);
        return () => clearTimeout(t);
    }, [load]);

    const t = data?.totals;
    return (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, maxWidth: 1100, width: '100%', alignSelf: 'center', gap: 12 }}>
            <Segmented options={[['7', 'Last 7 days'], ['14', '14 days'], ['30', '30 days']]} value={days} onChange={setDays} />
            {t ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {[
                        ['Sign-ups', t.signups],
                        ['Email confirmed', t.email_verified],
                        ['Phone confirmed', t.phone_verified],
                        ['Businesses opened', t.businesses],
                        ['Waiting approval', t.pending],
                    ].map(([label, v]) => (
                        <View key={label as string} style={{ flexGrow: 1, flexBasis: 140, backgroundColor: theme.panel, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 12 }}>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 11.5 }}>{label}</Text>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>{Number(v ?? 0).toLocaleString()}</Text>
                        </View>
                    ))}
                </View>
            ) : null}
            <SearchBox value={q} onChange={setQ} placeholder="Search name, email or phone" />
            {error ? <InlineNotice message={error} /> : null}
            {!data && !error ? <ActivityIndicator color={theme.primary} /> : null}
            {data?.results.map((u) => (
                <PosCard key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>{u.name || u.email || u.phone}</Text>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                            {u.email || 'no email'} · {u.phone || 'no phone'} · joined {date(u.joined)}
                        </Text>
                        {u.businesses.length ? (
                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }} numberOfLines={1}>
                                {u.businesses.map((b) => `${b.title} (${b.status.toLowerCase()})`).join(', ')}
                            </Text>
                        ) : null}
                    </View>
                    <View style={{ gap: 4, alignItems: 'flex-end' }}>
                        <Flag ok={u.email_verified} label="Email" />
                        <Flag ok={u.phone_verified} label="Phone" />
                        <Flag ok={!!u.identifier_number} label="ID" />
                    </View>
                </PosCard>
            ))}
        </ScrollView>
    );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            {ok ? <Check size={12} color={theme.success} /> : <X size={12} color={theme.textMuted} />}
            <Text style={{ color: ok ? theme.success : theme.textMuted, fontFamily: theme.font.bold, fontSize: 11 }}>{label}</Text>
        </View>
    );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, height: 46 }}>
            <Search size={16} color={theme.textMuted} />
            <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.textMuted} style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 15 }} />
        </View>
    );
}
