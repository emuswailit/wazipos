// components/credit/CreditHub.tsx
//
// WaziPOS Credit:
//   My loans   every loan you (or your business) owe: what's left, when it's due,
//              repay now (full or part) — the prompt pays your lender directly.
//   Lending    Bank / Facilitator admins: set up pricing and appetite, lending float
//              (top up / withdraw), the loan book with due, overdue and PAR30.
//   Lenders    WaziPOS admins approve or suspend lenders (licence check).

import creditApi, { type Facility, type FacilityStatus, type LenderBook, type LenderProfile, type Repayment } from '@/api/creditApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminSheet, ChoiceChips, FormRow, FormSection } from '@/components/common/listScreen';
import { SwitchField } from '@/components/common/SwitchField';
import { toast } from '@/components/common/Toast';
import { InlineNotice, OfflineNotice, PosHeader, PrimaryCTA, SoftButton, StatusPill } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { useCachedList } from '@/hooks/useCachedList';
import { describeResponse } from '@/utils/apiFeedback';
import { isPlatformAdmin } from '@/utils/platformAdmin';
import { isServerOk } from '@/utils/serverResponse';
import { useLocalSearchParams } from 'expo-router';
import { ArrowDownToLine, Building2, HandCoins, Landmark, Plus, Smartphone } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

type Tab = 'loans' | 'lending' | 'desk';
const VIOLET = '#8b5cf6';
const pointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;
const kes = (n: number) => `KES ${Math.round(Number(n || 0)).toLocaleString('en-KE')}`;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS: Record<FacilityStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }> = {
    ACTIVE: { label: 'Active', tone: 'info' },
    OVERDUE: { label: 'Overdue', tone: 'warning' },
    REPAID: { label: 'Repaid', tone: 'success' },
    DEFAULTED: { label: 'Defaulted', tone: 'danger' },
    WRITTEN_OFF: { label: 'Written off', tone: 'danger' },
};
const SEGMENTS: { value: string; label: string }[] = [
    { value: 'RETAILER_B2B', label: 'Retailers ← wholesalers' },
    { value: 'WHOLESALER_B2B', label: 'Wholesalers ← distributors' },
    { value: 'CUSTOMER', label: 'Shop customers' },
    { value: 'FOOD', label: 'Restaurant diners' },
];
const REGULATORS = [
    { value: 'CBK_BANK', label: 'CBK bank' },
    { value: 'CBK_MFB', label: 'Microfinance bank' },
    { value: 'CBK_DCP', label: 'Digital credit provider' },
    { value: 'SASRA', label: 'SACCO (SASRA)' },
    { value: 'OTHER', label: 'Other' },
];

export default function CreditHub() {
    const { theme, user } = useAuth() as any;
    const { isOnline } = useNetworkStatus();
    const params = useLocalSearchParams<{ tab?: string }>();
    const admin = isPlatformAdmin(user);
    const [tab, setTab] = useState<Tab>((['lending', 'desk'].includes(String(params.tab)) ? params.tab : 'loans') as Tab);
    const [isLender, setIsLender] = useState(false);
    const [repayFor, setRepayFor] = useState<Facility | null>(null);
    const loans = useCachedList<Facility>({ key: 'credit_loans', fetch: () => creditApi.myLoans() as any, pick: (d) => d?.facilities });

    useEffect(() => {
        creditApi.myLender().then((res: any) => setIsLender(isServerOk(res))).catch(() => undefined);
    }, []);

    const owing = loans.items.filter((f) => ['ACTIVE', 'OVERDUE', 'DEFAULTED'].includes(f.status));
    const totalOwed = owing.reduce((n, f) => n + f.outstanding, 0);
    const tabs: [Tab, string][] = [['loans', `My loans${owing.length ? ` · ${owing.length}` : ''}`], ...(isLender ? ([['lending', 'Lending']] as [Tab, string][]) : []), ...(admin ? ([['desk', 'Lenders']] as [Tab, string][]) : [])];

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 1100, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={loans.refreshing} onRefresh={() => void loans.refresh()} tintColor={theme.primary} />}>
                <PosHeader icon={HandCoins} title="WaziPOS Credit" subtitle="Lipa Baadaye — a lender pays your order now, you repay in 7, 14 or 28 days" />
                {tabs.length > 1 ? (
                    <View style={{ flexDirection: 'row', backgroundColor: theme.surfaceAlt, borderRadius: 14, padding: 4, marginBottom: 16 }}>
                        {tabs.map(([k, label]) => {
                            const on = tab === k;
                            return (
                                <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? theme.panel : 'transparent', ...pointer }}>
                                    <Text style={{ color: on ? VIOLET : theme.textMuted, fontFamily: theme.font.bold, fontSize: 13 }}>{label}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                ) : null}
                {!isOnline ? <OfflineNotice title="Offline" message="Showing loans saved on this device. Repaying and lending need a connection." /> : null}

                {tab === 'loans' ? (
                    <View style={{ gap: 12 }}>
                        {owing.length ? (
                            <View style={{ padding: 18, borderRadius: 20, backgroundColor: VIOLET, gap: 4 }}>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.semibold, fontSize: 12 }}>You owe</Text>
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 30, letterSpacing: -0.6 }}>{kes(totalOwed)}</Text>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                    Next due {day(owing.slice().sort((a, b) => a.due_date.localeCompare(b.due_date))[0].due_date)} · repaying on time raises your WaziScore and your limit
                                </Text>
                            </View>
                        ) : null}
                        {loans.error ? <InlineNotice tone="danger" message={loans.error} /> : null}
                        {loans.loading && !loans.items.length ? <ActivityIndicator color={VIOLET} style={{ marginTop: 40 }} /> : null}
                        {!loans.loading && !loans.items.length ? (
                            <Empty title="No loans" message="When you check out, look for “Lipa Baadaye · WaziPOS Credit” — a lender pays the seller and you repay later." />
                        ) : null}
                        {loans.items.map((f) => (
                            <LoanCard key={f.id} f={f} onRepay={() => setRepayFor(f)} />
                        ))}
                    </View>
                ) : tab === 'lending' ? (
                    <Lending />
                ) : (
                    <Desk />
                )}
            </ScrollView>
            <RepaySheet
                facility={repayFor}
                onClose={() => setRepayFor(null)}
                onDone={() => {
                    setRepayFor(null);
                    void loans.refresh();
                }}
            />
        </View>
    );
}

function LoanCard({ f, onRepay, lenderView }: { f: Facility; onRepay?: () => void; lenderView?: boolean }) {
    const { theme } = useAuth();
    const st = STATUS[f.status];
    const pct = f.total_due ? Math.min(1, f.repaid / f.total_due) : 0;
    const open = ['ACTIVE', 'OVERDUE', 'DEFAULTED'].includes(f.status);
    const when = f.days_to_due > 1 ? `due in ${f.days_to_due} days` : f.days_to_due === 1 ? 'due tomorrow' : f.days_to_due === 0 ? 'due today' : `${-f.days_to_due} days late`;
    return (
        <View style={{ borderRadius: 20, backgroundColor: theme.panel, borderWidth: 1, borderColor: f.status === 'OVERDUE' || f.status === 'DEFAULTED' ? theme.warning : theme.border, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: `${VIOLET}1a`, alignItems: 'center', justifyContent: 'center' }}>
                    <Landmark size={19} color={VIOLET} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{lenderView ? f.borrower : f.lender.name}</Text>
                    <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {f.reference} · order {f.order_reference} at {f.seller ?? '—'}
                    </Text>
                </View>
                <StatusPill tone={st.tone} label={st.label} />
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
                <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: f.status === 'REPAID' ? theme.success : VIOLET }} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                <Mini label="Borrowed" value={kes(f.principal)} />
                <Mini label="Total" value={kes(f.total_due)} />
                <Mini label="Repaid" value={kes(f.repaid)} />
                <Mini label={open ? 'Left' : 'Closed'} value={open ? kes(f.outstanding) : f.repaid_at ? day(f.repaid_at) : '—'} />
                <Mini label="Due" value={`${day(f.due_date)}${open ? ` · ${when}` : ''}`} />
            </View>
            {f.late_fees ? <Text style={{ color: theme.warning, fontFamily: theme.font.medium, fontSize: 12 }}>Late fees so far: {kes(f.late_fees)}</Text> : null}
            {lenderView && f.borrower_phone ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>Borrower phone {f.borrower_phone} · consent by {f.consent_via === 'OTP' ? 'SMS code' : 'app'}</Text> : null}
            {open && onRepay ? <SoftButton label={`Repay ${kes(f.outstanding)}`} icon={Smartphone} tone="navy" onPress={onRepay} /> : null}
        </View>
    );
}

function RepaySheet({ facility, onClose, onDone }: { facility: Facility | null; onClose: () => void; onDone: () => void }) {
    const { theme, user } = useAuth() as any;
    const [amount, setAmount] = useState('');
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<Repayment | null>(null);
    const timer = useRef<any>(null);

    useEffect(() => {
        if (!facility) return;
        setAmount(String(Math.ceil(facility.outstanding)));
        setPhone(String(user?.phone ?? ''));
        setError(null);
        setPending(null);
        return () => clearInterval(timer.current);
    }, [facility, user]);

    const go = async () => {
        if (!facility) return;
        setBusy(true);
        setError(null);
        const res: any = await creditApi.repay(facility.id, phone.trim(), amount.trim() || undefined).catch(() => null);
        setBusy(false);
        if (!isServerOk(res)) return setError(describeResponse(res, 'The payment prompt was not sent.').message);
        const r: Repayment = res.data.repayment;
        setPending(r);
        let n = 0;
        timer.current = setInterval(async () => {
            n += 1;
            const x: any = await creditApi.refreshRepayment(r.id).catch(() => null);
            if (isServerOk(x)) {
                const next: Repayment = x.data.repayment;
                setPending(next);
                if (next.status === 'SUCCESS') {
                    clearInterval(timer.current);
                    toast.success('Repayment received', `${kes(next.amount)} paid to ${facility.lender.name}.`);
                    onDone();
                } else if (next.status === 'FAILED') {
                    clearInterval(timer.current);
                    setError('The payment didn’t go through. Try again.');
                    setPending(null);
                }
            }
            if (n > 40) clearInterval(timer.current);
        }, 4000);
    };

    return (
        <AdminSheet visible={!!facility} onClose={onClose} title="Repay loan" subtitle={facility ? `${facility.reference} · ${facility.lender.name}` : undefined} icon="cash-outline" width={520}>
            {facility ? (
                pending ? (
                    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
                        <Smartphone size={34} color={VIOLET} />
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }}>Check your phone</Text>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 14, textAlign: 'center' }}>Enter your PIN to pay {kes(pending.amount)} to {facility.lender.name}.</Text>
                        <ActivityIndicator color={VIOLET} />
                        {error ? <InlineNotice tone="danger" message={error} /> : null}
                    </View>
                ) : (
                    <View style={{ gap: 14 }}>
                        <InlineNotice tone="info" message={`${kes(facility.outstanding)} left, due ${day(facility.due_date)}. You can pay it all or a part — it goes straight to ${facility.lender.name}.`} />
                        <CustomTextField label="Amount (KES)" value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} keyboardType="number-pad" />
                        <CustomTextField label="Pay from (M-Pesa / Airtel Money)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                        {error ? <InlineNotice tone="danger" message={error} /> : null}
                        <PrimaryCTA label={`Pay ${kes(Number(amount) || 0)}`} icon={Smartphone} onPress={() => void go()} loading={busy} />
                    </View>
                )
            ) : null}
        </AdminSheet>
    );
}

/* ------------------------------------------------------------------ lenders */

function Lending() {
    const { theme, user } = useAuth() as any;
    const [book, setBook] = useState<LenderBook | null>(null);
    const [profile, setProfile] = useState<LenderProfile | null | undefined>(undefined);
    const [filter, setFilter] = useState<FacilityStatus | ''>('');
    const [editing, setEditing] = useState(false);
    const [floatSheet, setFloatSheet] = useState<'topup' | 'withdraw' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        const res: any = await creditApi.myLender().catch(() => null);
        if (!isServerOk(res)) return setError(describeResponse(res, 'Could not load your lending.').message);
        const p: LenderProfile | null = res.data.lender.profile;
        setProfile(p);
        if (p) {
            const b: any = await creditApi.book(filter || undefined).catch(() => null);
            if (isServerOk(b)) setBook(b.data.book);
        }
    };
    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter]);

    if (profile === undefined) return error ? <InlineNotice tone="danger" message={error} /> : <ActivityIndicator color={VIOLET} />;
    if (!profile || editing) return <LenderForm profile={profile} onSaved={() => { setEditing(false); void load(); }} onCancel={profile ? () => setEditing(false) : undefined} />;

    const st = book?.stats;
    return (
        <View style={{ gap: 14 }}>
            {profile.status === 'PENDING' ? <InlineNotice tone="warning" message="WaziPOS is checking your licence. You can top up your float now; lending starts once approved." /> : null}
            {profile.status === 'SUSPENDED' ? <InlineNotice tone="danger" message="Lending is suspended by WaziPOS. Existing loans keep running." /> : null}
            {!profile.wallet ? <InlineNotice tone="warning" message="Add a JamboPay WALLET payout account — every repayment is paid straight into it." /> : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <View style={{ flexGrow: 1, flexBasis: 260, padding: 18, borderRadius: 20, backgroundColor: VIOLET, gap: 6 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.semibold, fontSize: 12 }}>Lending float</Text>
                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 28 }}>{kes(profile.float_balance)}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.medium, fontSize: 12 }}>Pays sellers instantly when traders borrow</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                        <SoftButton label="Top up" icon={Plus} tone="neutral" onPress={() => setFloatSheet('topup')} style={{ flexGrow: 1 }} />
                        <SoftButton label="Withdraw" icon={ArrowDownToLine} tone="neutral" onPress={() => setFloatSheet('withdraw')} style={{ flexGrow: 1 }} />
                    </View>
                </View>
                {st ? (
                    <View style={{ flexGrow: 2, flexBasis: 320, padding: 16, borderRadius: 20, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                        <Mini label="Disbursed" value={kes(st.disbursed)} />
                        <Mini label="Outstanding" value={kes(st.outstanding)} />
                        <Mini label="Collected" value={kes(st.collected)} />
                        <Mini label="Due this week" value={kes(st.due_this_week)} />
                        <Mini label="Active / overdue" value={`${st.active} / ${st.overdue}`} />
                        <Mini label="PAR30" value={`${st.par30_pct}%`} />
                        <Mini label="Income (repaid)" value={kes(st.income)} />
                    </View>
                ) : null}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>Loan book</Text>
                <SoftButton label="Pricing & limits" tone="neutral" onPress={() => setEditing(true)} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(['', 'ACTIVE', 'OVERDUE', 'REPAID', 'DEFAULTED'] as (FacilityStatus | '')[]).map((s) => {
                    const on = filter === s;
                    return (
                        <Pressable key={s || 'all'} onPress={() => setFilter(s)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? VIOLET : theme.border, backgroundColor: on ? `${VIOLET}14` : theme.panel, justifyContent: 'center', ...pointer }}>
                            <Text style={{ color: on ? VIOLET : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{s ? STATUS[s].label : 'All'}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
            {!book ? <ActivityIndicator color={VIOLET} /> : !book.facilities.length ? <Empty title="No loans yet" message="When traders check out with WaziPOS Credit and pick you, their loans appear here." /> : null}
            {(book?.facilities ?? []).map((f) => (
                <LoanCard key={f.id} f={f} lenderView />
            ))}
            <FloatSheet mode={floatSheet} max={profile.float_balance} phoneDefault={String(user?.phone ?? '')} onClose={() => setFloatSheet(null)} onDone={() => { setFloatSheet(null); void load(); }} />
        </View>
    );
}

function FloatSheet({ mode, max, phoneDefault, onClose, onDone }: { mode: 'topup' | 'withdraw' | null; max: number; phoneDefault: string; onClose: () => void; onDone: () => void }) {
    const { theme } = useAuth();
    const [amount, setAmount] = useState('');
    const [phone, setPhone] = useState(phoneDefault);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [waiting, setWaiting] = useState(false);
    const timer = useRef<any>(null);
    useEffect(() => {
        setAmount('');
        setError(null);
        setWaiting(false);
        return () => clearInterval(timer.current);
    }, [mode]);

    const go = async () => {
        setBusy(true);
        setError(null);
        if (mode === 'withdraw') {
            const res: any = await creditApi.withdraw(amount).catch(() => null);
            setBusy(false);
            if (isServerOk(res)) {
                toast.success('Withdrawal on its way', `${kes(res.data.withdrawal.amount)} to your payout account.`);
                onDone();
            } else setError(describeResponse(res, 'Not withdrawn.').message);
            return;
        }
        const res: any = await creditApi.topUp(amount, phone.trim()).catch(() => null);
        setBusy(false);
        if (!isServerOk(res)) return setError(describeResponse(res, 'The payment prompt was not sent.').message);
        setWaiting(true);
        const id = res.data.topup.id;
        let n = 0;
        timer.current = setInterval(async () => {
            n += 1;
            const x: any = await creditApi.refreshTopUp(id).catch(() => null);
            const status = isServerOk(x) ? x.data.topup.status : null;
            if (status === 'SUCCESS') {
                clearInterval(timer.current);
                toast.success('Float topped up', `${kes(Number(amount))} added.`);
                onDone();
            } else if (status === 'FAILED' || n > 40) {
                clearInterval(timer.current);
                setWaiting(false);
                setError(status === 'FAILED' ? 'The payment didn’t go through.' : 'Still waiting — check the float shortly.');
            }
        }, 4000);
    };

    return (
        <AdminSheet visible={!!mode} onClose={onClose} title={mode === 'withdraw' ? 'Withdraw float' : 'Top up float'} icon="wallet-outline" width={480}>
            {waiting ? (
                <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
                    <Smartphone size={34} color={VIOLET} />
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }}>Check your phone</Text>
                    <ActivityIndicator color={VIOLET} />
                </View>
            ) : (
                <View style={{ gap: 14 }}>
                    <InlineNotice tone="info" message={mode === 'withdraw' ? `You can withdraw up to ${kes(max)} to your payout account.` : 'The float is held in the WaziPOS collection account and pays sellers the moment a trader borrows from you.'} />
                    <CustomTextField label="Amount (KES)" value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} keyboardType="number-pad" />
                    {mode === 'topup' ? <CustomTextField label="Pay from (M-Pesa / Airtel Money)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /> : null}
                    {error ? <InlineNotice tone="danger" message={error} /> : null}
                    <PrimaryCTA label={mode === 'withdraw' ? 'Withdraw' : 'Send payment prompt'} onPress={() => void go()} loading={busy} disabled={!Number(amount)} />
                </View>
            )}
        </AdminSheet>
    );
}

function LenderForm({ profile, onSaved, onCancel }: { profile: LenderProfile | null; onSaved: () => void; onCancel?: () => void }) {
    const [f, setF] = useState<Record<string, any>>(() => ({
        display_name: profile?.display_name ?? '', regulator: profile?.regulator ?? 'CBK_DCP', licence_number: profile?.licence_number ?? '',
        segments: profile?.segments?.length ? profile.segments : ['RETAILER_B2B'], rate_7: String(profile?.rate_7 ?? 1.5), rate_14: String(profile?.rate_14 ?? 3),
        rate_28: String(profile?.rate_28 ?? 5), admin_fee_pct: String(profile?.admin_fee_pct ?? 1), admin_fee_min: String(profile?.admin_fee_min ?? 50),
        excise_pct: String(profile?.excise_pct ?? 20), late_fee_pct_week: String(profile?.late_fee_pct_week ?? 1), grace_days: String(profile?.grace_days ?? 3),
        min_amount: String(profile?.min_amount ?? 500), max_amount: String(profile?.max_amount ?? 100000), max_exposure_per_borrower: String(profile?.max_exposure_per_borrower ?? 150000),
        min_score: String(profile?.min_score ?? 40), auto_collect: profile?.auto_collect ?? true, terms: profile?.terms ?? '', status: profile?.status,
    }));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
    const num = (k: string, label: string) => <CustomTextField label={label} value={String(f[k])} onChangeText={(t) => set(k, t.replace(/[^\d.]/g, ''))} keyboardType="numeric" />;
    const toggleSeg = (v: string) => set('segments', f.segments.includes(v) ? f.segments.filter((x: string) => x !== v) : [...f.segments, v]);

    const save = async () => {
        setBusy(true);
        setError(null);
        const res: any = await creditApi.saveLender(f).catch(() => null);
        setBusy(false);
        if (isServerOk(res)) {
            toast.success('Lending set-up saved', profile ? undefined : 'WaziPOS will check your licence and switch lending on.');
            onSaved();
        } else setError(describeResponse(res, 'Not saved.').message);
    };

    return (
        <View style={{ gap: 18 }}>
            <FormSection title="Who you are" hint="Lenders must be licensed by CBK (bank, microfinance, digital credit provider) or SASRA (SACCO).">
                <FormRow>
                    <CustomTextField label="Name traders see" value={f.display_name} onChangeText={(t) => set('display_name', t)} />
                    <CustomTextField label="Licence number" required value={f.licence_number} onChangeText={(t) => set('licence_number', t)} autoCapitalize="characters" />
                </FormRow>
                <ChoiceChips<string> label="Regulator" options={REGULATORS} value={f.regulator} onChange={(v) => set('regulator', v)} />
            </FormSection>
            <FormSection title="Who you lend to">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {SEGMENTS.map((s) => {
                        const on = f.segments.includes(s.value);
                        return (
                            <Pressable key={s.value} onPress={() => toggleSeg(s.value)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? VIOLET : '#cbd5e1', backgroundColor: on ? `${VIOLET}14` : 'transparent', justifyContent: 'center', ...pointer }}>
                                <Text style={{ color: on ? VIOLET : '#475569', fontWeight: '700', fontSize: 12.5 }}>{s.label}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            </FormSection>
            <FormSection title="Price" hint="Flat interest for the period. Excise duty applies to fees (20% today). Every offer shows the total cost and APR before the trader accepts.">
                <FormRow>
                    {num('rate_7', '7 days interest %')}
                    {num('rate_14', '14 days interest %')}
                    {num('rate_28', '28 days interest %')}
                </FormRow>
                <FormRow>
                    {num('admin_fee_pct', 'Admin fee %')}
                    {num('admin_fee_min', 'Minimum admin fee (KES)')}
                    {num('excise_pct', 'Excise duty on fees %')}
                </FormRow>
                <FormRow>
                    {num('late_fee_pct_week', 'Late fee % a week')}
                    {num('grace_days', 'Grace days')}
                </FormRow>
            </FormSection>
            <FormSection title="Limits" hint="WaziScore (0–100) comes from paid orders, time on WaziPOS and repayment history.">
                <FormRow>
                    {num('min_amount', 'Smallest loan (KES)')}
                    {num('max_amount', 'Largest loan (KES)')}
                </FormRow>
                <FormRow>
                    {num('max_exposure_per_borrower', 'Most owed per borrower (KES)')}
                    {num('min_score', 'Minimum WaziScore')}
                </FormRow>
                <SwitchField label="Send the repayment prompt on the due date" value={!!f.auto_collect} onChange={(v) => set('auto_collect', v)} hint="Borrowers just enter their PIN." />
                <CustomTextField label="Your terms (shown to borrowers)" value={f.terms} onChangeText={(t) => set('terms', t)} multiline numberOfLines={3} />
                {profile && (profile.status === 'ACTIVE' || profile.status === 'PAUSED') ? (
                    <ChoiceChips<string> label="Lending" options={[{ value: 'ACTIVE', label: 'On' }, { value: 'PAUSED', label: 'Paused' }]} value={f.status} onChange={(v) => set('status', v)} />
                ) : null}
            </FormSection>
            {error ? <InlineNotice tone="danger" message={error} /> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
                {onCancel ? <SoftButton label="Cancel" tone="neutral" onPress={onCancel} /> : null}
                <PrimaryCTA label={profile ? 'Save' : 'Start lending on WaziPOS'} icon={Building2} onPress={() => void save()} loading={busy} style={{ flex: 1 }} />
            </View>
        </View>
    );
}

function Desk() {
    const { theme } = useAuth();
    const [rows, setRows] = useState<LenderProfile[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const load = async () => {
        const res: any = await creditApi.deskLenders().catch(() => null);
        if (isServerOk(res)) setRows(res.data.lenders);
        else setError(describeResponse(res, 'Could not load lenders.').message);
    };
    useEffect(() => {
        void load();
    }, []);
    const decide = async (p: LenderProfile, d: 'APPROVE' | 'SUSPEND') => {
        const res: any = await creditApi.decideLender(p.id, d).catch(() => null);
        if (isServerOk(res)) {
            toast.success(d === 'APPROVE' ? 'Lender approved' : 'Lender suspended');
            void load();
        } else toast.fromResponse(res, 'Not updated.');
    };
    return (
        <View style={{ gap: 10 }}>
            {error ? <InlineNotice tone="danger" message={error} /> : null}
            {rows === null ? <ActivityIndicator color={VIOLET} /> : !rows.length ? <Empty title="No lenders yet" message="Banks and facilitators appear here once they set up lending." /> : null}
            {(rows ?? []).map((p) => (
                <View key={p.id} style={{ borderRadius: 18, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{p.display_name}</Text>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{p.entity.title} · {p.regulator} licence {p.licence_number} · wallet {p.wallet ?? 'none'}</Text>
                        </View>
                        <StatusPill tone={p.status === 'ACTIVE' ? 'success' : p.status === 'PENDING' ? 'warning' : 'danger'} label={p.status} />
                    </View>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {p.rate_7}% / {p.rate_14}% / {p.rate_28}% · fee {p.admin_fee_pct}% (min {kes(p.admin_fee_min)}) · float {kes(p.float_balance)} · lent {kes(p.total_disbursed)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {p.status !== 'ACTIVE' ? <SoftButton label="Approve" tone="navy" onPress={() => void decide(p, 'APPROVE')} /> : null}
                        {p.status !== 'SUSPENDED' ? <SoftButton label="Suspend" tone="danger" onPress={() => void decide(p, 'SUSPEND')} /> : null}
                    </View>
                </View>
            ))}
        </View>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.semibold, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{value}</Text>
        </View>
    );
}

function Empty({ title, message }: { title: string; message: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ alignItems: 'center', paddingVertical: 48, gap: 8 }}>
            <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: `${VIOLET}1a`, alignItems: 'center', justifyContent: 'center' }}>
                <HandCoins size={26} color={VIOLET} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{title}</Text>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13.5, textAlign: 'center', maxWidth: 360 }}>{message}</Text>
        </View>
    );
}
