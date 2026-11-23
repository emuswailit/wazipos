// components/insurance/InsuranceHub.tsx
//
// WaziPOS Cover — one place for every user:
//   Cover     the policies meant for you (shoppers, riders, business admins) with a
//             live "from" price, plus your deliveries that can still be insured
//   Policies  what you hold, when it ends, renew / cancel, make a claim
//   Claims    each claim and where it stands
//   Desk      (platform admins) review, approve, decline, mark paid + book summary
// Deep link: /insurance?product=SAFE_PARCEL&kind=manufacturer&id=<order> opens the
// opt-in sheet for that delivery (used right after a checkout).

import insuranceApi, { type Catalogue, type Claim, type ClaimStatus, type CoverProduct, type DeskSummary, type InsurableDelivery, type Policy } from '@/api/insuranceApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { toast } from '@/components/common/Toast';
import { InlineNotice, OfflineNotice, PosHeader, SoftButton, StatusPill } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { useCachedList } from '@/hooks/useCachedList';
import { describeResponse } from '@/utils/apiFeedback';
import { isPlatformAdmin } from '@/utils/platformAdmin';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, FileWarning, Package, ShieldCheck, Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import ClaimSheet from './ClaimSheet';
import { CLAIM_STATUS, fmtWhen, gradientBg, kes, POLICY_STATUS, PRODUCT_META, pointer } from './coverShared';
import OptInSheet, { clearCatalogueCache, getCatalogue, type Subject } from './OptInSheet';

type Tab = 'cover' | 'policies' | 'claims' | 'desk';
const CAT_KEY = 'wazipos_cover_catalogue_v1';

export default function InsuranceHub() {
    const { theme, user } = useAuth() as any;
    const { width } = useWindowDimensions();
    const { isOnline } = useNetworkStatus();
    const params = useLocalSearchParams<{ tab?: string; product?: string; kind?: string; id?: string; label?: string }>();
    const router = useRouter();
    const admin = isPlatformAdmin(user);
    const cols = width >= 1100 ? 3 : width >= 700 ? 2 : 1;

    const [tab, setTab] = useState<Tab>((['policies', 'claims', 'desk'].includes(String(params.tab)) ? params.tab : 'cover') as Tab);
    const [cat, setCat] = useState<Catalogue | null>(null);
    const [catError, setCatError] = useState<string | null>(null);
    const [deliveries, setDeliveries] = useState<InsurableDelivery[]>([]);
    const [opt, setOpt] = useState<{ product: CoverProduct; inputs?: Record<string, any>; subject?: Subject | null; locked?: string[] } | null>(null);
    const [claimFor, setClaimFor] = useState<Policy | null>(null);

    const policies = useCachedList<Policy>({ key: 'cover_policies', fetch: () => insuranceApi.myPolicies() as any, pick: (d) => d?.policies });
    const claims = useCachedList<Claim>({ key: 'cover_claims', fetch: () => insuranceApi.myClaims() as any, pick: (d) => d?.claims, enabled: tab === 'claims' });

    const loadCatalogue = useCallback(async () => {
        const raw = await AsyncStorage.getItem(CAT_KEY).catch(() => null);
        if (raw && !cat) {
            try {
                setCat(JSON.parse(raw));
            } catch {
                /* stale */
            }
        }
        if (!isOnline) return;
        clearCatalogueCache();
        const c = await getCatalogue(true);
        if (c) {
            setCat(c);
            setCatError(null);
            AsyncStorage.setItem(CAT_KEY, JSON.stringify(c)).catch(() => undefined);
        } else setCatError('Could not load your cover options.');
        const res: any = await insuranceApi.insurableDeliveries().catch(() => null);
        if (isServerOk(res)) setDeliveries(res.data.deliveries);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline]);

    useEffect(() => {
        void loadCatalogue();
    }, [loadCatalogue]);

    // Deep link from a checkout: open the opt-in for that delivery.
    useEffect(() => {
        if (params.product) {
            const product = String(params.product).toUpperCase() as CoverProduct;
            setOpt({ product, subject: params.kind && params.id ? { kind: String(params.kind), id: String(params.id), label: params.label ? String(params.label) : 'This delivery' } : null, locked: params.id ? ['value'] : [] });
        }
    }, [params.product, params.kind, params.id, params.label]);

    const refreshAll = async () => {
        await Promise.all([loadCatalogue(), policies.refresh(), tab === 'claims' ? claims.refresh() : Promise.resolve()]);
    };

    // SafeParcel always covers one delivery: pick it from the list, or insure at checkout.
    const safeParcelHint = () => {
        if (deliveries.length === 1) {
            const d = deliveries[0];
            setOpt({ product: 'SAFE_PARCEL', inputs: { value: d.value, distance_km: d.distance_km, mode: d.method === 'COURIER' ? 'COURIER' : 'MOTORBIKE' }, subject: { kind: d.subject_kind, id: d.subject_id, label: `From ${d.seller ?? 'the seller'}` }, locked: d.value ? ['value'] : [] });
        } else if (deliveries.length) toast.info('Pick a delivery', 'Choose one under “Deliveries you can still insure”.');
        else toast.info('Insure at checkout', 'When you buy with delivery, tap “Insure this delivery” — or come back here while it is on the way.');
    };

    const afterOptIn = () => {
        void policies.refresh();
        void loadCatalogue();
    };

    const tabs: [Tab, string][] = [['cover', 'Cover for you'], ['policies', `My policies${policies.items.length ? ` · ${policies.items.length}` : ''}`], ['claims', 'Claims'], ...(admin ? ([['desk', 'Claims desk']] as [Tab, string][]) : [])];

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 1240, width: '100%', alignSelf: 'center' }}
                refreshControl={<RefreshControl refreshing={policies.refreshing} onRefresh={() => void refreshAll()} tintColor={theme.primary} />}
            >
                <PosHeader icon={ShieldCheck} title="WaziPOS Cover" subtitle="Small premiums, real protection — pay per parcel, per day or per month" />

                {cat && !cat.sales_enabled ? (
                    <View style={[{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, marginBottom: 14, alignItems: 'center' }, gradientBg('#0b1733', '#14306e')]}>
                        <Sparkles size={20} color="#7cc4ff" />
                        <Text style={{ flex: 1, color: '#dbe4f8', fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>
                            Launching soon. Opt in now to lock your quote — no money is taken until cover opens with our licensed insurance partner.
                        </Text>
                    </View>
                ) : null}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, padding: 4, backgroundColor: theme.surfaceAlt, borderRadius: 14 }} style={{ marginBottom: 16, flexGrow: 0 }}>
                    {tabs.map(([k, label]) => {
                        const on = tab === k;
                        return (
                            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ height: 40, paddingHorizontal: 16, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? theme.panel : 'transparent', ...pointer }}>
                                <Text style={{ color: on ? theme.primary : theme.textMuted, fontFamily: theme.font.bold, fontSize: 13 }}>{label}</Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                {!isOnline ? <OfflineNotice title="Offline" message="Showing what's saved on this device. Prices, opting in and claims need a connection." /> : null}

                {tab === 'cover' ? (
                    <View style={{ gap: 18 }}>
                        {catError ? <InlineNotice tone="danger" message={catError} /> : null}
                        {!cat ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
                            {(cat?.products ?? []).map((p) => {
                                const meta = PRODUCT_META[p.product];
                                const Icon = meta.icon;
                                return (
                                    <View key={p.product} style={{ width: `${100 / cols}%` as any, padding: 6 }}>
                                        <Pressable
                                            onPress={() => (p.product === 'SAFE_PARCEL' ? safeParcelHint() : setOpt({ product: p.product, inputs: p.prefill }))}
                                            style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, ...pointer }}
                                        >
                                            <View style={[{ padding: 18, gap: 10, minHeight: 130 }, gradientBg(meta.colors[0], meta.colors[1])]}>
                                                <View style={{ position: 'absolute', right: -16, top: -12, opacity: 0.16 }}>
                                                    <Icon size={130} color="#fff" />
                                                </View>
                                                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Icon size={22} color="#fff" />
                                                </View>
                                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 20, letterSpacing: -0.3 }}>{p.name}</Text>
                                                <Text style={{ color: 'rgba(255,255,255,0.9)', fontFamily: theme.font.medium, fontSize: 13 }}>{p.tagline}</Text>
                                            </View>
                                            <View style={{ padding: 16, gap: 12 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                                    <View>
                                                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.semibold, fontSize: 11 }}>FROM</Text>
                                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>
                                                            {p.from_premium != null ? kes(p.from_premium) : '—'}
                                                            <Text style={{ color: theme.textMuted, fontSize: 12 }}> {p.period ?? ''}</Text>
                                                        </Text>
                                                    </View>
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.semibold, fontSize: 11 }}>CLAIM UP TO</Text>
                                                        <Text style={{ color: theme.success, fontFamily: theme.font.bold, fontSize: 15 }}>{p.cover != null ? kes(p.cover) : '—'}</Text>
                                                    </View>
                                                </View>
                                                {p.active ? (
                                                    <StatusPill tone="success" label={`Covered until ${fmtWhen(p.active.ends_at)}`} />
                                                ) : (
                                                    <SoftButton
                                                        label={p.product === 'SAFE_PARCEL' ? (deliveries.length ? `Insure a delivery · ${deliveries.length}` : 'Offered at checkout') : cat?.sales_enabled ? 'Get covered' : 'Opt in'}
                                                        icon={ShieldCheck}
                                                        onPress={() => (p.product === 'SAFE_PARCEL' ? safeParcelHint() : setOpt({ product: p.product, inputs: p.prefill }))}
                                                    />
                                                )}
                                            </View>
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </View>

                        {deliveries.length ? (
                            <View style={{ gap: 10 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>Deliveries you can still insure</Text>
                                {deliveries.map((d) => (
                                    <Pressable
                                        key={`${d.subject_kind}:${d.subject_id}`}
                                        onPress={() => setOpt({ product: 'SAFE_PARCEL', inputs: { value: d.value, distance_km: d.distance_km, mode: d.method === 'COURIER' ? 'COURIER' : 'MOTORBIKE' }, subject: { kind: d.subject_kind, id: d.subject_id, label: `From ${d.seller ?? 'the seller'}` }, locked: d.value ? ['value'] : [] })}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, ...pointer }}
                                    >
                                        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                                            <Package size={19} color={theme.primary} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>From {d.seller ?? 'a seller'}</Text>
                                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{kes(d.value)} of goods · {d.method === 'COURIER' ? 'courier' : 'local delivery'}{d.tracking ? ` · ${d.tracking}` : ''}</Text>
                                        </View>
                                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>Insure</Text>
                                        <ChevronRight size={16} color={theme.primary} />
                                    </Pressable>
                                ))}
                            </View>
                        ) : null}
                        {cat?.underwriter ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12, textAlign: 'center' }}>Underwritten by {cat.underwriter}.</Text> : null}
                    </View>
                ) : tab === 'policies' ? (
                    <View style={{ gap: 10 }}>
                        {policies.error ? <InlineNotice tone="danger" message={policies.error} /> : null}
                        {policies.loading && !policies.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}
                        {!policies.loading && !policies.items.length ? <Empty title="No cover yet" message="Pick a policy under Cover for you — most cost less than a soda." /> : null}
                        {policies.items.map((p) => (
                            <PolicyRow key={p.id} policy={p} onClaim={() => setClaimFor(p)} onRenew={() => setOpt({ product: p.product, inputs: p.inputs })} onChanged={() => void policies.refresh()} />
                        ))}
                    </View>
                ) : tab === 'claims' ? (
                    <View style={{ gap: 10 }}>
                        {claims.error ? <InlineNotice tone="danger" message={claims.error} /> : null}
                        {claims.loading && !claims.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}
                        {!claims.loading && !claims.items.length ? <Empty title="No claims" message="If something happens, open the policy under My policies and tap Make a claim." /> : null}
                        {claims.items.map((c) => (
                            <ClaimRow key={c.id} claim={c} />
                        ))}
                    </View>
                ) : (
                    <ClaimsDesk />
                )}
            </ScrollView>

            <OptInSheet
                visible={!!opt}
                product={opt?.product ?? null}
                inputs={opt?.inputs}
                subject={opt?.subject}
                locked={opt?.locked}
                source={params.product ? 'checkout_link' : 'hub'}
                onClose={() => {
                    setOpt(null);
                    if (params.product) router.setParams({ product: undefined, kind: undefined, id: undefined, label: undefined } as any);
                }}
                onDone={afterOptIn}
            />
            <ClaimSheet
                policy={claimFor}
                onClose={() => setClaimFor(null)}
                onFiled={() => {
                    setClaimFor(null);
                    setTab('claims');
                    void claims.refresh();
                    void policies.refresh();
                }}
            />
        </View>
    );
}

function PolicyRow({ policy: p, onClaim, onRenew, onChanged }: { policy: Policy; onClaim: () => void; onRenew: () => void; onChanged: () => void }) {
    const { theme } = useAuth();
    const appAlert = useAlert();
    const meta = PRODUCT_META[p.product];
    const st = POLICY_STATUS[p.status];
    const Icon = meta.icon;
    const endsSoon = p.status === 'ACTIVE' && p.ends_at && new Date(p.ends_at).getTime() - Date.now() < 5 * 86400000;
    const canClaim = p.status === 'ACTIVE' || p.status === 'EXPIRED';
    const cancel = () =>
        appAlert('Cancel this?', `${p.name} ${p.policy_number} hasn't started, so nothing is lost.`, [
            { text: 'Keep it', style: 'cancel' },
            {
                text: 'Cancel',
                style: 'destructive',
                onPress: async () => {
                    const res: any = await insuranceApi.cancel(p.id);
                    if (isServerOk(res)) {
                        toast.success('Cancelled');
                        onChanged();
                    } else toast.fromResponse(res, 'Could not cancel.');
                },
            },
        ]);
    return (
        <View style={{ borderRadius: 20, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, gradientBg(meta.colors[0], meta.colors[1])]}>
                    <Icon size={21} color="#fff" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }}>{p.name}</Text>
                    <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{p.policy_number}{p.subject_label ? ` · ${p.subject_label}` : ''}</Text>
                </View>
                <StatusPill tone={st.tone} label={st.label} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                <Mini label="Cover" value={kes(p.cover)} />
                <Mini label="Premium" value={kes(p.premium)} />
                <Mini label="Excess" value={p.excess ? kes(p.excess) : 'None'} />
                {p.ends_at ? <Mini label={p.status === 'ACTIVE' ? 'Ends' : 'Ended'} value={fmtWhen(p.ends_at)} /> : null}
            </View>
            {p.claims?.length ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>{p.claims.length} claim(s): {p.claims.map((c) => `${c.claim_number} ${CLAIM_STATUS[c.status].label.toLowerCase()}`).join(', ')}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {canClaim ? <SoftButton label="Make a claim" icon={FileWarning} tone="navy" onPress={onClaim} style={{ flexGrow: 1 }} /> : null}
                {endsSoon || p.status === 'EXPIRED' ? (p.product !== 'SAFE_PARCEL' && p.product !== 'TRADE_GUARD' ? <SoftButton label="Renew" onPress={onRenew} /> : null) : null}
                {['INTEREST', 'AWAITING_PAYMENT', 'FAILED'].includes(p.status) ? <SoftButton label="Cancel" tone="danger" onPress={cancel} /> : null}
            </View>
        </View>
    );
}

function ClaimRow({ claim: c }: { claim: Claim }) {
    const { theme } = useAuth();
    const st = CLAIM_STATUS[c.status];
    return (
        <View style={{ borderRadius: 18, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{c.incident_label}</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{c.claim_number} · {c.policy.name} · {fmtWhen(c.incident_at)}</Text>
                </View>
                <StatusPill tone={st.tone} label={st.label} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                <Mini label="Loss" value={kes(c.loss_amount)} />
                <Mini label="Estimate" value={kes(c.payable_estimate)} />
                {c.approved_amount != null ? <Mini label="Approved" value={kes(c.approved_amount)} /> : null}
            </View>
            {c.decision_note ? <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13 }}>“{c.decision_note}”</Text> : null}
        </View>
    );
}

/* ------------------------------------------------------------- claims desk */

function ClaimsDesk() {
    const { theme } = useAuth();
    const [status, setStatus] = useState<ClaimStatus | ''>('SUBMITTED');
    const [rows, setRows] = useState<Claim[] | null>(null);
    const [summary, setSummary] = useState<DeskSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);

    const load = async () => {
        setError(null);
        const [a, b]: any[] = await Promise.all([insuranceApi.deskClaims(status || undefined).catch(() => null), insuranceApi.deskSummary().catch(() => null)]);
        if (isServerOk(a)) setRows(a.data.claims);
        else {
            setRows([]);
            setError(describeResponse(a, 'Could not load claims.').message);
        }
        if (isServerOk(b)) setSummary(b.data.summary);
    };
    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    return (
        <View style={{ gap: 14 }}>
            {summary ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {summary.products.map((s) => (
                        <View key={s.product} style={{ flexGrow: 1, flexBasis: 200, padding: 14, borderRadius: 16, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, gap: 4 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{s.name}</Text>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>{s.active} active · {s.interest} pre-registered · {s.open_claims} open claims</Text>
                            <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 12.5 }}>Premiums {kes(s.premiums)} · paid out {kes(s.claims_paid)}{s.loss_ratio != null ? ` · ${s.loss_ratio}%` : ''}</Text>
                        </View>
                    ))}
                </View>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'PAID', 'REJECTED', ''] as (ClaimStatus | '')[]).map((s) => {
                    const on = status === s;
                    return (
                        <Pressable key={s || 'all'} onPress={() => setStatus(s)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primarySoft : theme.panel, justifyContent: 'center', ...pointer }}>
                            <Text style={{ color: on ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{s ? CLAIM_STATUS[s].label : 'All'}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
            {error ? <InlineNotice tone="danger" message={error} /> : null}
            {rows === null ? <ActivityIndicator color={theme.primary} /> : null}
            {rows && !rows.length ? <Empty title="Nothing here" message="No claims at this stage." /> : null}
            {(rows ?? []).map((c) => (
                <DeskRow key={c.id} claim={c} open={openId === c.id} onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))} onChanged={(n) => setRows((r) => (r ?? []).map((x) => (x.id === n.id ? n : x)))} />
            ))}
        </View>
    );
}

const DESK_NEXT: Record<ClaimStatus, ClaimStatus[]> = { SUBMITTED: ['IN_REVIEW', 'APPROVED', 'REJECTED'], IN_REVIEW: ['APPROVED', 'REJECTED'], APPROVED: ['PAID', 'REJECTED'], REJECTED: [], PAID: [] };

function DeskRow({ claim: c, open, onToggle, onChanged }: { claim: Claim; open: boolean; onToggle: () => void; onChanged: (c: Claim) => void }) {
    const { theme } = useAuth();
    const [amount, setAmount] = useState(String(c.approved_amount ?? c.payable_estimate));
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const st = CLAIM_STATUS[c.status];
    const decide = async (status: ClaimStatus) => {
        setBusy(status);
        setError(null);
        const res: any = await insuranceApi.decide({ claim_id: c.id, status, approved_amount: status === 'APPROVED' ? amount : undefined, note: note.trim() || undefined }).catch(() => null);
        setBusy(null);
        if (isServerOk(res)) {
            onChanged(res.data.claim);
            toast.success(`Claim ${CLAIM_STATUS[status].label.toLowerCase()}`, `${c.claimant?.name ?? 'The claimant'} was notified.`);
        } else setError(describeResponse(res, 'Not updated.').message);
    };
    return (
        <View style={{ borderRadius: 18, backgroundColor: theme.panel, borderWidth: 1, borderColor: open ? theme.primary : theme.border, overflow: 'hidden' }}>
            <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, ...pointer }}>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{c.policy.name} · {c.incident_label}</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{c.claim_number} · {c.claimant?.name} · loss {kes(c.loss_amount)} · est. {kes(c.payable_estimate)}</Text>
                </View>
                <StatusPill tone={st.tone} label={st.label} />
            </Pressable>
            {open ? (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13.5, lineHeight: 20 }}>{c.description}</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        Happened {fmtWhen(c.incident_at)}{c.police_reference ? ` · OB ${c.police_reference}` : ''} · policy {c.policy.policy_number} (cover {kes(c.policy.cover)}) · {c.claimant?.phone ?? ''} {c.claimant?.email ?? ''}
                    </Text>
                    {c.evidence ? <SoftButton label="Open evidence" tone="neutral" onPress={() => void Linking.openURL(c.evidence!)} /> : null}
                    {DESK_NEXT[c.status].includes('APPROVED') ? <CustomTextField label="Approve amount (KES)" value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ''))} keyboardType="numeric" /> : null}
                    {DESK_NEXT[c.status].length ? <CustomTextField label="Note to the claimant" value={note} onChangeText={setNote} multiline numberOfLines={2} placeholder="Required when declining" /> : null}
                    {error ? <InlineNotice tone="danger" message={error} /> : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {DESK_NEXT[c.status].map((s) => (
                            <SoftButton key={s} label={busy === s ? 'Saving…' : s === 'IN_REVIEW' ? 'Start review' : s === 'APPROVED' ? 'Approve' : s === 'PAID' ? 'Mark paid' : 'Decline'} tone={s === 'REJECTED' ? 'danger' : s === 'APPROVED' || s === 'PAID' ? 'navy' : 'primary'} onPress={() => void decide(s)} disabled={!!busy} style={{ flexGrow: 1 }} />
                        ))}
                    </View>
                </View>
            ) : null}
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
            <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={26} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{title}</Text>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13.5, textAlign: 'center', maxWidth: 340 }}>{message}</Text>
        </View>
    );
}
