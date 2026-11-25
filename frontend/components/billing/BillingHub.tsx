// components/billing/BillingHub.tsx — WaziPOS Tokens: balance, this month's usage, buy tokens, history.
//
// Pay per use instead of a monthly fee. 1 token = KES 1; each order uses a few
// tokens priced on its value, cheaper per order as the month gets busier, with a
// monthly ceiling. The first month from approval is free (usage shown at 0 with
// what it would have cost). The last copy is kept on the device, so the screen
// opens offline. WaziPOS admins also get a Wallets tab.

import billingApi, { type BillingStatus, type LedgerEntry, type TokenPack, type TopUp, type WalletRow } from '@/api/billingApi';
import { AdminSheet } from '@/components/common/listScreen';
import { toast } from '@/components/common/Toast';
import { InlineNotice, OfflineNotice, PosCard, PosHeader, PrimaryCTA, Segmented, SoftButton, StatusPill } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isPlatformAdmin } from '@/utils/platformAdmin';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Coins, Gift, Plus, Search, Sparkles, Zap } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import ClearInputButton from '@/components/common/ClearInputButton';

const CACHE = 'wazipos_billing_v1';
const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const fmt = (v: string | number | null | undefined, dp = 0) => n(v).toLocaleString('en-KE', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const tokensText = (v: string | number) => {
    const x = n(v);
    return Math.abs(x) < 10 && x % 1 !== 0 ? x.toFixed(2) : fmt(x);
};
const when = (iso: string) => new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

type Tab = 'overview' | 'history' | 'wallets';

export default function BillingHub() {
    const { theme, user } = useAuth() as any;
    const { isOnline } = useNetworkStatus();
    const params = useLocalSearchParams<{ tab?: string }>();
    const admin = isPlatformAdmin(user);
    const [tab, setTab] = useState<Tab>((['history', 'wallets'].includes(String(params.tab)) ? params.tab : 'overview') as Tab);
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [buying, setBuying] = useState(false);

    const load = useCallback(async () => {
        const raw = await AsyncStorage.getItem(CACHE).catch(() => null);
        if (raw) {
            try {
                setStatus((s) => s ?? JSON.parse(raw));
            } catch {
                /* stale copy */
            }
        }
        const res: any = await billingApi.status().catch(() => null);
        if (isServerOk(res)) {
            setStatus(res.data.billing);
            setError(null);
            AsyncStorage.setItem(CACHE, JSON.stringify(res.data.billing)).catch(() => undefined);
        } else if (res) setError(describeResponse(res, 'Billing could not be loaded.').message);
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    const refresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    const tabs: [Tab, string][] = [['overview', 'Overview'], ['history', 'History'], ...(admin ? ([['wallets', 'All wallets']] as [Tab, string][]) : [])];

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 48, maxWidth: 1100, width: '100%', alignSelf: 'center', gap: 14 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.primary} />}
            >
                <PosHeader
                    icon={Coins}
                    title="Billing"
                    subtitle="WaziPOS Tokens — pay only for the orders you process. No monthly fee."
                    right={status?.is_admin ? <SoftButton label="Buy tokens" icon={Plus} onPress={() => setBuying(true)} disabled={!isOnline} /> : null}
                />
                {!isOnline ? <OfflineNotice title="Offline" message="Showing your last saved balance. Top-ups need a connection." /> : null}
                {tabs.length > 1 ? <Segmented options={tabs} value={tab} onChange={setTab} /> : null}

                {tab === 'wallets' ? (
                    <AdminWallets />
                ) : !status ? (
                    <View style={{ paddingVertical: 60, alignItems: 'center', gap: 10 }}>
                        {error ? <InlineNotice message={error} /> : <ActivityIndicator color={theme.primary} />}
                        {error ? <SoftButton label="Try again" onPress={() => void load()} /> : null}
                    </View>
                ) : tab === 'overview' ? (
                    <Overview s={status} onBuy={() => setBuying(true)} />
                ) : (
                    <History />
                )}
            </ScrollView>
            {status ? (
                <BuySheet
                    visible={buying}
                    status={status}
                    defaultPhone={user?.phone ?? ''}
                    onClose={() => setBuying(false)}
                    onPaid={() => {
                        setBuying(false);
                        void load();
                    }}
                />
            ) : null}
        </View>
    );
}

/* ------------------------------------------------------------ overview */

function modeInfo(s: BillingStatus): { tone: 'success' | 'warning' | 'danger' | 'info'; label: string; line: string } {
    if (s.mode === 'SETUP') {
        return s.approval === 'PENDING'
            ? { tone: 'info', label: 'Awaiting approval', line: 'WaziPOS is reviewing your business. Your free month starts when it is approved.' }
            : { tone: 'info', label: 'Setting up', line: 'Finish setting up in the Business tab and submit for approval. Your free month starts then.' };
    }
    if (s.mode === 'TRIAL') {
        return { tone: 'success', label: 'Free month', line: `${s.trial_days_left ?? 0} day${s.trial_days_left === 1 ? '' : 's'} left, until ${day(s.trial_ends_at)}. Orders are free; we show what they would cost.` };
    }
    if (s.mode === 'EXEMPT') {
        return { tone: 'success', label: 'Not billed', line: 'WaziPOS does not charge tokens for this kind of business.' };
    }
    if (s.mode === 'LEGACY') {
        return { tone: 'success', label: 'Monthly plan', line: `Your monthly subscription covers orders until ${day(s.legacy_until)}. Then you move to tokens.` };
    }
    if (!s.can_operate) return { tone: 'danger', label: 'Top up needed', line: s.blocked_reason || 'Buy tokens to keep selling.' };
    if (n(s.balance) <= 0) return { tone: 'warning', label: 'Out of tokens', line: `Sales keep working until -${fmt(s.pricing.overdraft)} tokens. Top up now.` };
    if (s.is_low) return { tone: 'warning', label: 'Running low', line: 'Top up soon. Bigger packs carry bonus tokens.' };
    return { tone: 'success', label: 'Pay as you go', line: s.runway_days != null ? `At this month's pace your tokens last about ${s.runway_days} more day${s.runway_days === 1 ? '' : 's'}.` : 'Each order uses a few tokens, priced on its value.' };
}

function Overview({ s, onBuy }: { s: BillingStatus; onBuy: () => void }) {
    const { theme } = useAuth();
    const { width } = useWindowDimensions();
    const wide = width >= 860;
    const info = modeInfo(s);
    const free = s.mode !== 'TOKENS';
    const capPct = Math.min(100, s.month.cap_used_pct);

    return (
        <View style={{ gap: 14 }}>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14 }}>
                {/* Balance */}
                <View style={{ flex: 1.1, borderRadius: 22, padding: 20, backgroundColor: theme.navy, gap: 10, overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: theme.font.bold, fontSize: 11.5, letterSpacing: 0.8 }}>TOKEN BALANCE</Text>
                        <StatusPill tone={info.tone} label={info.label} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 44, lineHeight: 50 }}>{tokensText(s.balance)}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: theme.font.medium, fontSize: 14, marginBottom: 8 }}>tokens · KES {fmt(s.balance)}</Text>
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>{info.line}</Text>
                    {s.is_admin ? (
                        <Pressable onPress={onBuy} style={{ alignSelf: 'flex-start', marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                            <Zap size={16} color={theme.navy} />
                            <Text style={{ color: theme.navy, fontFamily: theme.font.bold, fontSize: 13.5 }}>Top up by M-Pesa / Airtel</Text>
                        </Pressable>
                    ) : (
                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: theme.font.medium, fontSize: 12 }}>Ask your business admin to top up.</Text>
                    )}
                </View>

                {/* This month */}
                <PosCard style={{ flex: 1, gap: 12 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>This month</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Stat label="Orders" value={fmt(s.month.orders)} />
                        <Stat label={free ? 'Would cost' : 'Tokens used'} value={tokensText(free ? s.month.listed : s.month.charged)} />
                        <Stat label="Month estimate" value={tokensText(s.month.projected)} />
                    </View>
                    <View style={{ gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>Monthly ceiling</Text>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{fmt(s.month.charged)} / {fmt(s.month.cap)} tokens</Text>
                        </View>
                        <View style={{ height: 8, borderRadius: 8, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
                            <View style={{ width: `${capPct}%`, height: 8, borderRadius: 8, backgroundColor: capPct >= 90 ? theme.success : theme.primary }} />
                        </View>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                            Past {fmt(s.month.cap)} tokens, every order is free for the rest of the month.
                        </Text>
                    </View>
                    {s.month.by_meter.length ? (
                        <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 }}>
                            {s.month.by_meter.map((m) => (
                                <View key={m.meter} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5, flex: 1 }} numberOfLines={1}>
                                        {m.label} · {fmt(m.orders)}
                                    </Text>
                                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>KES {fmt(m.value)} sold</Text>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5, minWidth: 60, textAlign: 'right' }}>{tokensText(free ? m.listed : m.charged)} t</Text>
                                </View>
                            ))}
                        </View>
                    ) : null}
                </PosCard>
            </View>

            <PriceList s={s} />

            <PosCard style={{ gap: 4 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15, marginBottom: 6 }}>Latest activity</Text>
                {s.recent.length ? s.recent.slice(0, 10).map((e) => <EntryRow key={e.id} e={e} />) : (
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13 }}>No activity yet. Your first paid order shows up here.</Text>
                )}
            </PosCard>
        </View>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ flex: 1, backgroundColor: theme.surfaceAlt, borderRadius: 14, padding: 10, gap: 2 }}>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>{label}</Text>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }} numberOfLines={1}>{value}</Text>
        </View>
    );
}

function PriceList({ s }: { s: BillingStatus }) {
    const { theme } = useAuth();
    const meters = s.pricing.meters.filter((m) => s.applies.includes(m.meter));
    return (
        <PosCard style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color={theme.primary} />
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>How you are charged</Text>
            </View>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5, lineHeight: 18 }}>
                1 token = KES {s.pricing.token_kes}. Each paid order uses a small share of its value, between a minimum and a maximum. The first {s.pricing.trial_days} days after approval are free.
            </Text>
            {meters.map((m) => (
                <View key={m.meter} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border, gap: 8 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13, flex: 1 }}>{m.label}</Text>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{m.rate_pct}%</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>min {m.min} · max {m.max}</Text>
                </View>
            ))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {s.pricing.tiers.map((t) => (
                    <View key={t.from_orders} style={{ backgroundColor: theme.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 11.5 }}>{t.label}</Text>
                    </View>
                ))}
                <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 11.5 }}>Ceiling {fmt(s.pricing.monthly_cap)} tokens/month</Text>
                </View>
            </View>
        </PosCard>
    );
}

const KIND_LABEL: Record<string, string> = { TOPUP: 'Top-up', BONUS: 'Bonus', USAGE: 'Order', TRIAL: 'Free', COVERED: 'Covered', ADJUST: 'Adjustment' };

function EntryRow({ e }: { e: LedgerEntry }) {
    const { theme } = useAuth();
    const t = n(e.tokens);
    const usage = ['USAGE', 'TRIAL', 'COVERED'].includes(e.kind);
    const free = e.kind === 'TRIAL' || e.kind === 'COVERED';
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: theme.border }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: usage ? theme.surfaceAlt : theme.successSoft ?? theme.primarySoft }}>
                {e.kind === 'BONUS' ? <Gift size={16} color={theme.success} /> : usage ? <Zap size={16} color={theme.textMuted} /> : <Coins size={16} color={theme.success} />}
            </View>
            <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                    {usage ? e.meter_label || 'Order' : KIND_LABEL[e.kind] || e.kind}
                    {usage && n(e.order_value) ? ` · KES ${fmt(e.order_value)}` : ''}
                </Text>
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 11.5 }} numberOfLines={1}>
                    {when(e.created)}
                    {e.note ? ` · ${e.note}` : ''}
                </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: t > 0 ? theme.success : free ? theme.textMuted : theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>
                    {free ? '0' : `${t > 0 ? '+' : ''}${tokensText(t)}`}
                </Text>
                {free && n(e.list_tokens) ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 10.5, textDecorationLine: 'line-through' }}>{tokensText(e.list_tokens)}</Text> : null}
            </View>
        </View>
    );
}

/* ------------------------------------------------------------ history */

function History() {
    const { theme } = useAuth();
    const [kind, setKind] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
    const [rows, setRows] = useState<LedgerEntry[]>([]);
    const [page, setPage] = useState(1);
    const [more, setMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPage = useCallback(
        async (p: number) => {
            setLoading(true);
            const res: any = await billingApi.ledger({ ...(kind !== 'ALL' ? { kind } : {}), page: p }).catch(() => null);
            setLoading(false);
            if (isServerOk(res)) {
                const l = res.data.ledger;
                setRows((r) => (p === 1 ? l.results : [...r, ...l.results]));
                setMore(!!l.has_more);
                setPage(p);
                setError(null);
            } else setError(describeResponse(res, 'History could not be loaded.').message);
        },
        [kind],
    );

    useEffect(() => {
        void fetchPage(1);
    }, [fetchPage]);

    return (
        <PosCard style={{ gap: 6 }}>
            <Segmented options={[['ALL', 'Everything'], ['OUT', 'Orders'], ['IN', 'Top-ups']]} value={kind} onChange={setKind} />
            {error ? <InlineNotice message={error} /> : null}
            {rows.map((e) => <EntryRow key={e.id} e={e} />)}
            {!loading && !rows.length && !error ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13, paddingVertical: 20, textAlign: 'center' }}>Nothing here yet.</Text> : null}
            {loading ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} /> : more ? <SoftButton label="Load more" tone="neutral" onPress={() => void fetchPage(page + 1)} /> : null}
        </PosCard>
    );
}

/* ------------------------------------------------------------ buy */

const KE_PHONE = /^(?:\+?254|0)?(7|1)\d{8}$/;

function BuySheet({ visible, status, defaultPhone, onClose, onPaid }: { visible: boolean; status: BillingStatus; defaultPhone: string; onClose: () => void; onPaid: () => void }) {
    const { theme } = useAuth();
    const packs = status.pricing.packs;
    const [code, setCode] = useState<string>(packs[1]?.code ?? packs[0]?.code ?? 'CUSTOM');
    const [amount, setAmount] = useState('');
    const [phone, setPhone] = useState(defaultPhone);
    const [busy, setBusy] = useState(false);
    const [topup, setTopup] = useState<TopUp | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tries = useRef(0);

    useEffect(() => {
        if (!visible) {
            if (timer.current) clearTimeout(timer.current);
            setTopup(null);
            setErr(null);
            setBusy(false);
        }
    }, [visible]);
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    const chosen: TokenPack | null = code === 'CUSTOM' ? null : packs.find((p) => p.code === code) ?? null;
    const customKes = n(amount);
    const minK = n(status.pricing.custom.min);
    const maxK = n(status.pricing.custom.max);

    const poll = (id: string) => {
        timer.current = setTimeout(async () => {
            tries.current += 1;
            const res: any = await billingApi.refreshTopUp(id).catch(() => null);
            const t: TopUp | undefined = isServerOk(res) ? res.data.topup : undefined;
            if (t) setTopup(t);
            if (t?.status === 'SUCCESS') {
                toast.success('Tokens added', `${tokensText(t.tokens)} tokens are in your wallet.`);
                onPaid();
                return;
            }
            if (t && ['FAILED', 'CANCELLED'].includes(t.status)) {
                setErr(t.description || 'The payment did not go through.');
                setBusy(false);
                return;
            }
            if (tries.current < 45) poll(id);
            else {
                setBusy(false);
                setErr('Still waiting for the payment. If you paid, your tokens arrive within a few minutes.');
            }
        }, 4000);
    };

    const pay = async () => {
        setErr(null);
        const ph = phone.replace(/\s+/g, '');
        if (!KE_PHONE.test(ph)) return setErr('Enter the M-Pesa / Airtel Money number, e.g. 0712345678');
        if (code === 'CUSTOM' && (customKes < minK || customKes > maxK)) return setErr(`Enter between KES ${fmt(minK)} and KES ${fmt(maxK)}`);
        setBusy(true);
        const res: any = await billingApi.buy({ ...(code === 'CUSTOM' ? { amount: customKes } : { pack: code }), phone: ph }).catch(() => null);
        if (isServerOk(res)) {
            const t: TopUp = res.data.topup;
            setTopup(t);
            tries.current = 0;
            poll(t.payment_id);
        } else {
            setBusy(false);
            const d = describeResponse(res, 'The payment prompt could not be sent.');
            setErr(d.message);
        }
    };

    return (
        <AdminSheet visible={visible} onClose={onClose} title="Buy WaziPOS tokens" subtitle="Pay by M-Pesa or Airtel Money — bigger packs carry bonus tokens" icon="flash-outline" dismissible={!busy} width={620}>
            <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {packs.map((p) => {
                        const on = code === p.code;
                        return (
                            <Pressable key={p.code} disabled={busy} onPress={() => setCode(p.code)} style={{ flexGrow: 1, flexBasis: 150, borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primarySoft : theme.panel, gap: 2 }}>
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>{p.label.toUpperCase()}</Text>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 19 }}>KES {fmt(p.kes)}</Text>
                                <Text style={{ color: n(p.bonus) ? theme.success : theme.textMuted, fontFamily: theme.font.bold, fontSize: 12 }}>
                                    {fmt(p.tokens)} tokens{n(p.bonus) ? ` · +${fmt(p.bonus)} free` : ''}
                                </Text>
                            </Pressable>
                        );
                    })}
                    <Pressable disabled={busy} onPress={() => setCode('CUSTOM')} style={{ flexGrow: 1, flexBasis: 150, borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: code === 'CUSTOM' ? theme.primary : theme.border, backgroundColor: code === 'CUSTOM' ? theme.primarySoft : theme.panel, gap: 4 }}>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>OTHER AMOUNT</Text>
                        <TextInput
                            value={amount}
                            onChangeText={(t) => {
                                setCode('CUSTOM');
                                setAmount(t.replace(/[^0-9]/g, ''));
                            }}
                            placeholder={`KES ${fmt(minK)}+`}
                            placeholderTextColor={theme.textMuted}
                            keyboardType="number-pad"
                            editable={!busy}
                            style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17, paddingVertical: 2 }}
                        />
                    </Pressable>
                </View>

                <View style={{ gap: 6 }}>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>PAY FROM</Text>
                    <TextInput
                        value={phone}
                        onChangeText={setPhone}
                        placeholder="0712345678"
                        placeholderTextColor={theme.textMuted}
                        keyboardType="phone-pad"
                        editable={!busy}
                        style={{ height: 48, borderRadius: 12, paddingHorizontal: 14, backgroundColor: theme.surfaceAlt, color: theme.text, fontFamily: theme.font.medium, fontSize: 16 }}
                    />
                </View>

                {topup && busy ? <InlineNotice tone="info" message={`Check your phone and enter your PIN to pay KES ${fmt(topup.kes)}. Waiting for confirmation…`} /> : null}
                {err ? <InlineNotice message={err} /> : null}

                <PrimaryCTA
                    label={busy ? 'Waiting for payment…' : `Pay KES ${fmt(chosen ? chosen.kes : customKes)}`}
                    icon={Zap}
                    loading={busy}
                    disabled={busy || (code === 'CUSTOM' && !customKes)}
                    onPress={() => void pay()}
                />
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 11.5, textAlign: 'center' }}>
                    Tokens never expire. You are charged only when you sell.
                </Text>
            </View>
        </AdminSheet>
    );
}

/* ------------------------------------------------------------ admin: all wallets */

function AdminWallets() {
    const { theme } = useAuth();
    const [q, setQ] = useState('');
    const [data, setData] = useState<{ wallets: WalletRow[]; totals: Record<string, any> } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [adjusting, setAdjusting] = useState<WalletRow | null>(null);

    const load = useCallback(async (term = '') => {
        const res: any = await billingApi.adminWallets(term || undefined).catch(() => null);
        if (isServerOk(res)) {
            setData(res.data.overview);
            setError(null);
        } else setError(describeResponse(res, 'Wallets could not be loaded.').message);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => void load(q.trim()), 300);
        return () => clearTimeout(t);
    }, [q, load]);

    return (
        <View style={{ gap: 12 }}>
            {data ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <Stat label="Wallets" value={fmt(data.totals.wallets)} />
                    <Stat label="Top-ups this month" value={`KES ${fmt(data.totals.month_topups_kes)}`} />
                    <Stat label="Tokens used" value={fmt(data.totals.month_usage)} />
                    <Stat label="In free month" value={fmt(data.totals.in_trial)} />
                    <Stat label="Empty" value={fmt(data.totals.empty)} />
                </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, height: 46 }}>
                <Search size={16} color={theme.textMuted} />
                <TextInput value={q} onChangeText={setQ} placeholder="Search businesses" placeholderTextColor={theme.textMuted} style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 15 }} />
                <ClearInputButton value={q} onClear={() => setQ('')} />
            </View>
            {error ? <InlineNotice message={error} /> : null}
            {!data && !error ? <ActivityIndicator color={theme.primary} /> : null}
            {data?.wallets.map((w) => (
                <PosCard key={w.entity} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>{w.title}</Text>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                            {w.entity_type.replace(/([A-Z])/g, ' $1').trim()} · {w.mode === 'TRIAL' ? `free until ${day(w.trial_ends_at)}` : w.mode.toLowerCase()} · {w.month_orders} orders this month
                        </Text>
                    </View>
                    <Text style={{ color: n(w.balance) <= 0 ? theme.danger : theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{tokensText(w.balance)}</Text>
                    <SoftButton label="Adjust" tone="neutral" onPress={() => setAdjusting(w)} />
                </PosCard>
            ))}
            <AdjustSheet row={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); void load(q.trim()); }} />
        </View>
    );
}

function AdjustSheet({ row, onClose, onDone }: { row: WalletRow | null; onClose: () => void; onDone: () => void }) {
    const { theme } = useAuth();
    const [tokens, setTokens] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    useEffect(() => {
        setTokens('');
        setNote('');
        setErr(null);
    }, [row]);
    const save = async () => {
        if (!row) return;
        setBusy(true);
        const res: any = await billingApi.adminAdjust(row.entity, Number(tokens), note.trim()).catch(() => null);
        setBusy(false);
        if (isServerOk(res)) {
            toast.success('Tokens adjusted', row.title);
            onDone();
        } else setErr(describeResponse(res, 'Could not adjust tokens.').message);
    };
    const input = { height: 46, borderRadius: 12, paddingHorizontal: 14, backgroundColor: theme.surfaceAlt, color: theme.text, fontFamily: theme.font.medium, fontSize: 15 } as const;
    return (
        <AdminSheet visible={!!row} onClose={onClose} title="Adjust tokens" subtitle={row?.title} icon="gift-outline" dismissible={!busy} width={460}>
            <View style={{ gap: 10 }}>
                <TextInput value={tokens} onChangeText={(t) => setTokens(t.replace(/[^0-9.-]/g, ''))} placeholder="Tokens, e.g. 200 or -50" placeholderTextColor={theme.textMuted} keyboardType="numbers-and-punctuation" style={input} />
                <TextInput value={note} onChangeText={setNote} placeholder="Reason (shown to the business)" placeholderTextColor={theme.textMuted} style={input} />
                {err ? <InlineNotice message={err} /> : null}
                <PrimaryCTA label="Save adjustment" loading={busy} disabled={!Number(tokens) || !note.trim()} onPress={() => void save()} />
            </View>
        </AdminSheet>
    );
}
