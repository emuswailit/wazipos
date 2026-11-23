// components/insurance/OptInSheet.tsx
//
// The one opt-in form for every WaziPOS Cover policy. Fields change with the policy;
// the price is re-worked live as you type (server pricing engine). Paying sends one
// M-Pesa / Airtel Money prompt and the sheet follows it until the cover is on.
// While sales aren't open (no underwriter signed yet) the same button pre-registers
// the quote for free.

import insuranceApi, { type Catalogue, type CoverProduct, type Policy } from '@/api/insuranceApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminSheet, ChoiceChips, FormRow, SheetButton } from '@/components/common/listScreen';
import { SwitchField } from '@/components/common/SwitchField';
import { toast } from '@/components/common/Toast';
import { InlineNotice, PrimaryCTA } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { CheckCircle2, Smartphone, Square, SquareCheck } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { kes, PRODUCT_META, pointer, QuoteCard, useLiveQuote } from './coverShared';

let catalogueCache: Catalogue | null = null;
export async function getCatalogue(force = false): Promise<Catalogue | null> {
    if (catalogueCache && !force) return catalogueCache;
    const res: any = await insuranceApi.catalogue().catch(() => null);
    if (isServerOk(res)) catalogueCache = res.data.catalogue;
    return catalogueCache;
}
export const clearCatalogueCache = () => {
    catalogueCache = null;
};

const nice = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export interface Subject {
    kind: string;
    id: string;
    label?: string;
}

interface Props {
    visible: boolean;
    product: CoverProduct | null;
    /** Starting values (from the catalogue prefill or the screen offering it). */
    inputs?: Record<string, any>;
    /** What it covers — an order's delivery; fixed when opened from a checkout. */
    subject?: Subject | null;
    /** Fields the screen already knows and the user shouldn't change (e.g. goods value). */
    locked?: string[];
    source?: string;
    onClose: () => void;
    onDone?: (policy: Policy) => void;
}

export default function OptInSheet({ visible, product, inputs: start, subject, locked = [], source, onClose, onDone }: Props) {
    const { theme, user } = useAuth() as any;
    const { isOnline } = useNetworkStatus();
    const [cat, setCat] = useState<Catalogue | null>(catalogueCache);
    const [inputs, setInputs] = useState<Record<string, any>>({});
    const [phone, setPhone] = useState('');
    const [terms, setTerms] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [policy, setPolicy] = useState<Policy | null>(null);
    const timer = useRef<any>(null);

    useEffect(() => {
        if (!visible || !product) return;
        const pre = cat?.products.find((p) => p.product === product)?.prefill ?? {};
        setInputs({ ...pre, ...(start ?? {}) });
        setPhone(String(user?.phone ?? ''));
        setTerms(false);
        setError(null);
        setPolicy(null);
        getCatalogue().then((c) => c && setCat(c));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, product]);

    useEffect(() => () => clearInterval(timer.current), []);

    const { quote, loading, error: quoteError } = useLiveQuote(product, inputs, visible && !policy);
    const set = (k: string, v: any) => setInputs((p) => ({ ...p, [k]: v }));
    const lock = (k: string) => locked.includes(k);
    const selling = !!cat?.sales_enabled;
    const meta = product ? PRODUCT_META[product] : null;

    const follow = (p: Policy) => {
        clearInterval(timer.current);
        let tries = 0;
        timer.current = setInterval(async () => {
            tries += 1;
            const res: any = await insuranceApi.refreshPayment(p.id).catch(() => null);
            if (isServerOk(res)) {
                const next: Policy = res.data.policy;
                setPolicy(next);
                if (next.status === 'ACTIVE') {
                    clearInterval(timer.current);
                    toast.success(`${next.name} is on`, `Policy ${next.policy_number} — covered up to ${kes(next.cover)}.`);
                    onDone?.(next);
                } else if (next.status === 'FAILED') {
                    clearInterval(timer.current);
                    setError('The payment didn’t go through. Try again.');
                }
            }
            if (tries > 40) clearInterval(timer.current);
        }, 4000);
    };

    const submit = async () => {
        if (!product || !quote) return;
        if (!terms) return setError('Tick that you’ve read what is and isn’t covered.');
        if (selling && phone.replace(/\D/g, '').length < 9) return setError('Enter the M-Pesa or Airtel Money number to pay from.');
        if (!isOnline) return setError("You're offline — connect to opt in.");
        setBusy(true);
        setError(null);
        try {
            const res: any = await insuranceApi.buy({ product, inputs, phone: phone.trim(), accept_terms: true, subject_kind: subject?.kind, subject_id: subject?.id, source });
            if (!isServerOk(res)) return setError(describeResponse(res, 'Not opted in.').message);
            const p: Policy = res.data.policy;
            setPolicy(p);
            if (p.status === 'AWAITING_PAYMENT') follow(p);
            if (p.status === 'INTEREST') {
                toast.success('You’re on the list', `We saved your ${p.name} quote of ${kes(p.premium)}. We’ll tell you when it opens.`);
                onDone?.(p);
            }
        } finally {
            setBusy(false);
        }
    };

    const chips = (key: string, values: (string | number)[], label: string, fmt: (v: any) => string = (v) => nice(String(v))) =>
        lock(key) ? null : (
            <ChoiceChips<string> label={label} options={values.map((v) => ({ value: String(v), label: fmt(v) }))} value={inputs[key] != null ? String(inputs[key]) : ''} onChange={(v) => set(key, isNaN(Number(v)) ? v : Number(v))} />
        );
    const num = (key: string, label: string, hint?: string) =>
        lock(key) ? null : <CustomTextField label={label} value={inputs[key] != null ? String(inputs[key]) : ''} onChangeText={(t) => set(key, t.replace(/[^\d.]/g, ''))} keyboardType="numeric" hint={hint} />;

    const fields = () => {
        const o = cat?.options;
        switch (product) {
            case 'SAFE_PARCEL':
                return (
                    <>
                        {num('value', 'Goods value (KES)', 'What the goods cost you')}
                        {chips('mode', o?.modes ?? ['MOTORBIKE'], 'How it travels')}
                        {chips('category', o?.categories ?? ['GENERAL'], 'What is it')}
                        {num('distance_km', 'Distance (km)')}
                    </>
                );
            case 'RIDER_SHIELD':
                return (
                    <>
                        {chips('plan', o?.rider_plans ?? ['DAY', 'WEEK', 'MONTH'], 'Cover for', (v) => ({ DAY: 'Today', WEEK: '7 days', MONTH: '30 days' } as any)[v] ?? v)}
                        {chips('mode', ['FOOT', 'BICYCLE', 'MOTORBIKE', 'CAR', 'VAN', 'TRUCK'], 'You ride / drive')}
                    </>
                );
            case 'DUKA_COVER':
                return (
                    <>
                        {num('stock_value', 'Stock value (KES)', inputs.stock_from_records ? 'Worked out from your stock records — adjust if needed' : 'Roughly what your stock cost you')}
                        {chips('sector', o?.sectors ?? ['GENERAL'], 'Your business', (v) => ({ FMCG: 'FMCG', PHARMA: 'Pharmacy', FOOD: 'Food & catering', ELECTRONICS: 'Electricals & electronics', GENERAL: 'General' } as any)[v] ?? v)}
                        {chips('cash_limit', o?.cash_levels ?? [5000, 10000, 20000], 'Cash cover', (v) => kes(v))}
                        <SwitchField label="Grilled doors or a night guard" value={!!inputs.secured} onChange={(v) => set('secured', v)} hint="Saves 10%" />
                        <Discounts inputs={quote?.inputs_used ?? inputs} />
                    </>
                );
            case 'TRADE_GUARD':
                return (
                    <>
                        <FormRow>
                            {num('amount', 'Credit amount (KES)')}
                            {num('days', 'Days to pay', 'Up to 90')}
                        </FormRow>
                        {lock('buyer_name') ? null : (
                            <FormRow>
                                <CustomTextField label="Customer name" value={String(inputs.buyer_name ?? '')} onChangeText={(t) => set('buyer_name', t)} />
                                <CustomTextField label="Customer phone" value={String(inputs.buyer_phone ?? '')} onChangeText={(t) => set('buyer_phone', t)} keyboardType="phone-pad" />
                            </FormRow>
                        )}
                    </>
                );
            case 'TILL_GUARD':
                return (
                    <>
                        {num('staff_count', 'Staff', 'Everyone who handles cash or stock')}
                        {chips('limit', o?.till_limits ?? [50000, 100000, 200000], 'Cover limit', (v) => kes(v))}
                        <Discounts inputs={quote?.inputs_used ?? inputs} />
                    </>
                );
            default:
                return null;
        }
    };

    const done = policy && (policy.status === 'ACTIVE' || policy.status === 'INTEREST');
    const waiting = policy?.status === 'AWAITING_PAYMENT';

    return (
        <AdminSheet
            visible={visible}
            onClose={onClose}
            title={meta ? meta.name : 'Cover'}
            subtitle={subject?.label ?? meta?.short}
            icon="shield-checkmark-outline"
            width={620}
            footer={done ? <SheetButton label="Done" icon="checkmark" onPress={onClose} grow /> : undefined}
        >
            {done ? (
                <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
                    <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: `${theme.success}1f`, alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle2 size={32} color={theme.success} />
                    </View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 19 }}>{policy!.status === 'ACTIVE' ? 'You’re covered' : 'You’re on the list'}</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 14, textAlign: 'center', maxWidth: 380 }}>
                        {policy!.status === 'ACTIVE'
                            ? `Policy ${policy!.policy_number} · up to ${kes(policy!.cover)} until ${policy!.ends_at ? new Date(policy!.ends_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}.`
                            : `${policy!.name} opens soon. Your quote of ${kes(policy!.premium)} is saved — we’ll message you to switch it on.`}
                    </Text>
                </View>
            ) : waiting ? (
                <View style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
                    <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Smartphone size={30} color={theme.primary} />
                    </View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>Check your phone</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 14, textAlign: 'center', maxWidth: 360 }}>
                        Enter your PIN to pay {kes(policy!.premium)}. Your cover starts as soon as the payment arrives.
                    </Text>
                    <ActivityIndicator color={theme.primary} />
                    {error ? <InlineNotice tone="danger" message={error} /> : null}
                </View>
            ) : (
                <View style={{ gap: 16 }}>
                    {fields()}
                    {quoteError ? <InlineNotice tone="warning" message={quoteError} /> : null}
                    <QuoteCard quote={quote} loading={loading} />
                    {selling ? <CustomTextField label="Pay from (M-Pesa / Airtel Money)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07…" /> : null}
                    <Pressable onPress={() => setTerms((t) => !t)} accessibilityRole="checkbox" accessibilityState={{ checked: terms }} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', ...pointer }}>
                        {terms ? <SquareCheck size={20} color={theme.primary} /> : <Square size={20} color={theme.textMuted} />}
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.regular, fontSize: 13, lineHeight: 19 }}>
                            I've read what is and isn't covered, and that claims are checked before payment.
                        </Text>
                    </Pressable>
                    {error ? <InlineNotice tone="danger" message={error} /> : null}
                    <PrimaryCTA
                        label={!quote ? 'Getting your price…' : selling ? `Pay ${kes(quote.premium)} & get covered` : `Pre-register · ${kes(quote.premium)} (free for now)`}
                        onPress={() => void submit()}
                        loading={busy}
                        disabled={!quote || loading}
                    />
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 11.5, textAlign: 'center' }}>
                        {cat?.underwriter ? `Underwritten by ${cat.underwriter}. ` : 'WaziPOS Cover is arranged with a licensed insurance partner. '}
                        {selling ? 'You pay once by mobile money; no card needed.' : 'Sales open soon — pre-registering takes no money.'}
                    </Text>
                </View>
            )}
        </AdminSheet>
    );
}

/** Discounts WaziPOS applies from what it knows (shop guard, stock takes). */
function Discounts({ inputs }: { inputs: Record<string, any> }) {
    const { theme } = useAuth();
    const items = [inputs.shop_guard ? 'Shop guard on — 10–15% off' : null, inputs.recent_stock_take ? 'Recent stock take — 5% off' : null].filter(Boolean) as string[];
    if (!items.length) {
        return <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12 }}>Tip: switch on Shop guard and book a stock take to lower your premium.</Text>;
    }
    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {items.map((t) => (
                <View key={t} style={{ height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: `${theme.success}1a`, justifyContent: 'center' }}>
                    <Text style={{ color: theme.success, fontFamily: theme.font.bold, fontSize: 11.5 }}>{t}</Text>
                </View>
            ))}
        </View>
    );
}
