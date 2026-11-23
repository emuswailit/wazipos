// components/onboarding/SetupWizard.tsx — self sign-up, one checklist from account to approved business.
//
//   1. Confirm email (link)   2. Confirm phone (SMS code)   3. ID / passport + photo
//   4. Business + GPS (any kind of business)   5. Where we pay you (payout account)
//   6. Opening stock (required for shops, wholesalers, distributors)   7. Submit
//
// The steps and what's done come from the server (onboarding GetOnboarding), so the
// app and WaziPOS admins see the same checklist. WaziPOS approves the business; the
// free month starts then and billing moves to WaziPOS Tokens after it.

import onboardingApi, { type OnboardingState, type OnboardingStep } from '@/api/onboardingApi';
import type { PayoutAccount, PayoutAccountDetails } from '@/api/payoutAccountsApi';
import sellerApi, { type SellerReadiness } from '@/api/sellerOnboardingApi';
import verifyApi, { type MyVerification } from '@/api/verifyApi';
import AdminPayoutAccountEditModal from '@/components/admin/payoutAccounts/AdminPayoutAccountEditModal';
import { BusinessStep, ProfileStep } from '@/components/business/StartSelling';
import { toast } from '@/components/common/Toast';
import { InlineNotice, PosCard, PrimaryCTA, SoftButton, StatusPill } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Building2, Check, ChevronDown, ChevronRight, Clock, IdCard, Landmark, Mail, Package, PartyPopper, Phone, Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

const CACHE = 'wazipos_onboarding_v1';
const ICONS: Record<string, any> = { email: Mail, phone: Phone, identity: IdCard, business: Building2, payout: Landmark, stock: Package };

export default function SetupWizard({ onBack }: { onBack?: () => void }) {
    const { theme, login } = useAuth() as any;
    const { isOnline } = useNetworkStatus();
    const router = useRouter();
    const [state, setState] = useState<OnboardingState | null>(null);
    const [readiness, setReadiness] = useState<SellerReadiness | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        const raw = await AsyncStorage.getItem(CACHE).catch(() => null);
        if (raw) {
            try {
                setState((s) => s ?? JSON.parse(raw));
            } catch {
                /* stale */
            }
        }
        const [res, r]: any[] = await Promise.all([onboardingApi.state().catch(() => null), sellerApi.getReadiness().catch(() => null)]);
        if (isServerOk(res)) {
            const s: OnboardingState = res.data.onboarding;
            setState(s);
            setError(null);
            AsyncStorage.setItem(CACHE, JSON.stringify(s)).catch(() => undefined);
            setOpen((o) => o ?? s.steps.find((x) => !x.done)?.key ?? null);
        } else if (res) setError(describeResponse(res, 'Your setup could not be loaded.').message);
        if (isServerOk(r)) setReadiness(r.data.readiness);
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    const advance = async () => {
        await load();
        setOpen(null);
    };
    // After load, open the first unfinished step when nothing is open.
    useEffect(() => {
        if (state && open === null) setOpen(state.steps.find((x) => !x.done)?.key ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    const submit = async () => {
        setSubmitting(true);
        const res: any = await onboardingApi.submit().catch(() => null);
        setSubmitting(false);
        if (isServerOk(res)) {
            setState(res.data.onboarding);
            toast.success('Submitted', 'WaziPOS is reviewing your business. We will email you.');
        } else toast.fromResponse(res, 'Could not submit.');
    };

    if (!state) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.background }}>
                {error ? <InlineNotice message={error} /> : <ActivityIndicator color={theme.primary} />}
                {error ? <SoftButton label="Try again" onPress={() => void load()} /> : null}
            </View>
        );
    }

    const status = state.approval?.status;
    const doneCount = state.steps.filter((s) => s.done).length;

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
            <View style={{ width: '100%', maxWidth: 660, gap: 14 }}>
                {onBack ? (
                    <Pressable onPress={onBack} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>‹ Your businesses</Text>
                    </Pressable>
                ) : null}
                <View style={{ gap: 6 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 26 }}>
                        {state.business ? `Set up ${state.business.title}` : 'Start selling on WaziPOS'}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 14, lineHeight: 20 }}>
                        A few steps and WaziPOS approves you. Your first month is free; after that you pay only for the orders you process.
                    </Text>
                </View>

                {/* Progress */}
                <PosCard style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{doneCount} of {state.steps.length} done</Text>
                        {status === 'PENDING' ? <StatusPill tone="info" label="Awaiting approval" /> : status === 'REJECTED' ? <StatusPill tone="danger" label="Changes needed" /> : status === 'APPROVED' ? <StatusPill tone="success" label="Approved" /> : <StatusPill tone="warning" label="Setting up" />}
                    </View>
                    <View style={{ height: 8, borderRadius: 8, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
                        <View style={{ width: `${state.progress}%`, height: 8, borderRadius: 8, backgroundColor: theme.success }} />
                    </View>
                </PosCard>

                {status === 'REJECTED' && state.approval?.reason ? <InlineNotice tone="danger" message={`WaziPOS asked for changes: ${state.approval.reason}`} /> : null}
                {status === 'PENDING' ? (
                    <PosCard style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        <Clock size={26} color={theme.primary} />
                        <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>We're reviewing your business</Text>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5, lineHeight: 18 }}>
                                Most businesses are approved within one working day. You can keep adding stock meanwhile.
                            </Text>
                        </View>
                    </PosCard>
                ) : null}
                {state.business && !state.is_current ? (
                    <InlineNotice tone="warning" message={`You're working in another business. Switch to ${state.business.title} (profile menu) to set up its payout account and stock.`} />
                ) : null}

                {state.steps.map((step, i) => (
                    <StepCard key={step.key} step={step} index={i + 1} open={open === step.key} onToggle={() => setOpen(open === step.key ? null : step.key)}>
                        {step.key === 'email' || step.key === 'phone' ? (
                            <VerifyBlock kind={step.key} onDone={advance} />
                        ) : step.key === 'identity' ? (
                            readiness ? <ProfileStep readiness={readiness} onSaved={(r) => { setReadiness(r); void advance(); }} /> : <ActivityIndicator color={theme.primary} />
                        ) : step.key === 'business' ? (
                            state.business ? (
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>
                                    {step.done ? `${state.business.title} is set up with its location.` : 'Set the business location from your businesses list (Business tab).'}
                                </Text>
                            ) : readiness?.ready ? (
                                <BusinessStep
                                    readiness={readiness}
                                    onEditProfile={() => setOpen('identity')}
                                    onCreated={async (token) => {
                                        await login(token);
                                        toast.success('Business created', 'Next: tell us where to pay you.');
                                        await advance();
                                    }}
                                />
                            ) : (
                                <InlineNotice tone="info" message="Finish your ID / passport step first." />
                            )
                        ) : step.key === 'payout' ? (
                            state.business && state.is_current ? <PayoutBlock title={state.business.title} entityId={state.business.id} onSaved={advance} /> : <InlineNotice tone="info" message="Create your business first." />
                        ) : step.key === 'stock' ? (
                            <View style={{ gap: 10 }}>
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>
                                    {step.done ? `You have ${step.detail}. Add more any time.` : `Add what you sell so you can make your first sale on day one${step.required ? ' — at least one item is needed for approval' : ''}. Scan barcodes or pick from the WaziPOS catalogue.`}
                                </Text>
                                {step.route ? <SoftButton label={step.done ? 'Open inventory' : 'Add stock now'} icon={Package} onPress={() => router.push(step.route as any)} disabled={!state.is_current} /> : null}
                            </View>
                        ) : null}
                    </StepCard>
                ))}

                {status === 'APPROVED' ? (
                    <PosCard style={{ alignItems: 'center', gap: 8, paddingVertical: 22 }}>
                        <PartyPopper size={30} color={theme.success} />
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }}>You're live!</Text>
                        <SoftButton label="See billing & free month" onPress={() => router.push('/billing' as any)} />
                    </PosCard>
                ) : status !== 'PENDING' ? (
                    <View style={{ gap: 8 }}>
                        {state.missing.length && state.business ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5, textAlign: 'center' }}>Still to do: {state.missing.join(', ')}</Text> : null}
                        <PrimaryCTA label={status === 'REJECTED' ? 'Submit again for approval' : 'Submit for approval'} icon={Send} disabled={!state.can_submit || !isOnline} loading={submitting} onPress={() => void submit()} />
                    </View>
                ) : null}
            </View>
        </ScrollView>
    );
}

function StepCard({ step, index, open, onToggle, children }: { step: OnboardingStep; index: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
    const { theme } = useAuth();
    const Icon = ICONS[step.key] ?? Package;
    return (
        <PosCard active={open} padded={false} style={{ overflow: 'hidden' }}>
            <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: step.done ? theme.successSoft : theme.primarySoft }}>
                    {step.done ? <Check size={18} color={theme.success} /> : <Icon size={18} color={theme.primary} />}
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>
                        {index}. {step.label}
                        {!step.required ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>  · optional</Text> : null}
                    </Text>
                    {step.detail ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>{step.detail}</Text> : null}
                </View>
                {open ? <ChevronDown size={18} color={theme.textMuted} /> : <ChevronRight size={18} color={theme.textMuted} />}
            </Pressable>
            {open ? <View style={{ paddingHorizontal: 14, paddingBottom: 16, gap: 12 }}>{children}</View> : null}
        </PosCard>
    );
}

/* ------------------------------------------------------------ email / phone */

function VerifyBlock({ kind, onDone }: { kind: 'email' | 'phone'; onDone: () => void }) {
    const { theme } = useAuth();
    const router = useRouter();
    const [v, setV] = useState<MyVerification | null>(null);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const load = useCallback(async () => {
        const res: any = await verifyApi.status().catch(() => null);
        if (isServerOk(res)) setV(res.data.verification);
    }, []);
    useEffect(() => {
        void load();
    }, [load]);

    const run = async (key: string, fn: () => Promise<any>, okText: string) => {
        setBusy(key);
        setMsg(null);
        const res: any = await fn().catch(() => null);
        setBusy(null);
        if (isServerOk(res)) {
            const nv: MyVerification = res.data.verification;
            setV(nv);
            setMsg({ text: okText, ok: true });
            if ((kind === 'phone' && nv.phone_verified) || (kind === 'email' && nv.email_verified)) onDone();
        } else setMsg({ text: describeResponse(res, 'Please try again.').message, ok: false });
    };

    if (!v) return <ActivityIndicator color={theme.primary} />;

    if (kind === 'email') {
        if (!v.email) {
            return (
                <View style={{ gap: 10 }}>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13 }}>Add an email address to your profile — we send receipts, payouts and approval news there.</Text>
                    <SoftButton label="Open my profile" onPress={() => router.push('/(tabs)/profile' as any)} />
                </View>
            );
        }
        return (
            <View style={{ gap: 10 }}>
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>
                    {v.email_verified ? `${v.email} is confirmed.` : `Open the link we emailed to ${v.email}, then tap "I've opened it".`}
                </Text>
                {!v.email_verified ? (
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <SoftButton label={busy === 'send' ? 'Sending…' : v.email_link_sent_at ? 'Send a new link' : 'Send the link'} icon={Mail} disabled={!!busy} onPress={() => void run('send', () => verifyApi.sendEmailLink(), 'Link sent — check your inbox (and spam).')} />
                        <SoftButton label={busy === 'check' ? 'Checking…' : "I've opened it"} tone="neutral" disabled={!!busy} onPress={() => void run('check', () => verifyApi.status(), 'Not confirmed yet — open the link in the email first.')} />
                    </View>
                ) : null}
                {msg ? <InlineNotice tone={msg.ok ? 'success' : 'danger'} message={msg.text} /> : null}
            </View>
        );
    }

    return (
        <View style={{ gap: 10 }}>
            {!v.phone ? (
                <InlineNotice tone="info" message="Add your phone in the ID / passport step first — we text the code to it." />
            ) : v.phone_verified ? (
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13 }}>{v.phone} is confirmed.</Text>
            ) : (
                <>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>
                        {v.phone_code_pending ? `Enter the code we texted to ${v.phone}.` : `We'll text a code to ${v.phone}.`}
                    </Text>
                    {v.phone_code_pending ? (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TextInput
                                value={code}
                                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                                placeholder="Code"
                                placeholderTextColor={theme.textMuted}
                                keyboardType="number-pad"
                                textContentType="oneTimeCode"
                                autoComplete="sms-otp"
                                style={{ flex: 1, height: 46, borderRadius: 12, paddingHorizontal: 14, backgroundColor: theme.surfaceAlt, color: theme.text, fontFamily: theme.font.bold, fontSize: 18, letterSpacing: 4 }}
                            />
                            <SoftButton label={busy === 'confirm' ? 'Checking…' : 'Confirm'} disabled={code.length < 4 || !!busy} onPress={() => void run('confirm', () => verifyApi.confirmPhone(code), 'Phone confirmed.')} />
                        </View>
                    ) : null}
                    <SoftButton label={busy === 'send' ? 'Sending…' : v.phone_code_pending ? 'Text me a new code' : 'Text me the code'} icon={Phone} tone={v.phone_code_pending ? 'neutral' : 'primary'} disabled={!!busy} onPress={() => void run('send', () => verifyApi.sendPhoneCode(), 'Code sent.')} />
                    {v.phone_sms_error ? <InlineNotice tone="warning" message={v.phone_sms_error} /> : null}
                </>
            )}
            {msg ? <InlineNotice tone={msg.ok ? 'success' : 'danger'} message={msg.text} /> : null}
        </View>
    );
}

/* ------------------------------------------------------------ payout account */

function PayoutBlock({ title, entityId, onSaved }: { title: string; entityId: string; onSaved: () => void }) {
    const { theme } = useAuth();
    const [accounts, setAccounts] = useState<PayoutAccount[] | null>(null);
    const [editing, setEditing] = useState<PayoutAccount | 'new' | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res: any = await onboardingApi.payoutAccounts().catch(() => null);
        setAccounts(isServerOk(res) ? res.data.payout_accounts ?? [] : []);
    }, []);
    useEffect(() => {
        void load();
    }, [load]);

    const save = async (details: PayoutAccountDetails) => {
        setSaving(true);
        setFormError(null);
        const id = editing && editing !== 'new' ? editing.id : undefined;
        const res: any = await onboardingApi.savePayoutAccount(details, id).catch(() => null);
        setSaving(false);
        if (isServerOk(res)) {
            setEditing(null);
            toast.success('Payout account saved', 'WaziPOS confirms it when approving your business.');
            await load();
            onSaved();
        } else setFormError(describeResponse(res, 'The payout account could not be saved.').message);
    };

    return (
        <View style={{ gap: 10 }}>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>
                Where your sales money is sent: M-Pesa number, till, paybill, bank or SACCO account. Buyers pay WaziPOS and we pay you out here.
            </Text>
            {accounts === null ? <ActivityIndicator color={theme.primary} /> : null}
            {accounts?.map((a: any) => (
                <Pressable key={a.id} onPress={() => setEditing(a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: theme.surfaceAlt }}>
                    <Landmark size={18} color={theme.primary} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{a.account_name}</Text>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>{a.account_type} · {a.account_number}{a.business_number ? ` · ${a.business_number}` : ''}</Text>
                    </View>
                    {String(a.is_active) === 'true' ? <StatusPill tone="success" label={a.is_verified ? 'Verified' : 'Active'} /> : null}
                </Pressable>
            ))}
            <SoftButton label={accounts?.length ? 'Add another account' : 'Add payout account'} icon={Landmark} onPress={() => setEditing('new')} />
            <AdminPayoutAccountEditModal
                visible={!!editing}
                onClose={() => setEditing(null)}
                initialData={editing && editing !== 'new' ? editing : null}
                submitting={saving}
                error={formError}
                onSubmit={save}
                lockedEntity={{ id: entityId, title }}
                canVerify={false}
            />
        </View>
    );
}
